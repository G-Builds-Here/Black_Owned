//! NATS cache invalidation handler for Valkey key deletion.
//!
//! This module provides:
//! - NATS subscriber for cache.invalidate subject
//! - Valkey key deletion within 500ms of message receipt

use anyhow::{anyhow, Result};
use async_nats::jetstream;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::{sync::RwLock, task::JoinHandle, time::{timeout, Duration}};

/// NATS subject for cache invalidation requests
pub const CACHE_INVALIDATE_SUBJECT: &str = "cache.invalidate";

/// Maximum processing timeout (must complete within 500ms per AC requirement)
const PROCESS_TIMEOUT: Duration = Duration::from_millis(450);

/// Cache invalidation request payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheInvalidatePayload {
    /// The cache key to invalidate
    pub key: String,
}

/// Cache invalidation worker configuration
#[derive(Debug, Clone)]
pub struct CacheInvalidatorConfig {
    /// NATS server URL
    pub nats_url: String,
    /// Valkey connection URL
    pub valkey_url: String,
}

impl Default for CacheInvalidatorConfig {
    fn default() -> Self {
        Self {
            nats_url: "nats://localhost:4222".to_string(),
            valkey_url: "redis://localhost:6379".to_string(),
        }
    }
}

impl CacheInvalidatorConfig {
    /// Create a new config with custom NATS URL
    #[must_use]
    pub fn with_nats_url(mut self, nats_url: &str) -> Self {
        self.nats_url = nats_url.to_string();
        self
    }

    /// Create a new config with custom Valkey URL
    #[must_use]
    pub fn with_valkey_url(mut self, valkey_url: &str) -> Self {
        self.valkey_url = valkey_url.to_string();
        self
    }
}

/// Cache invalidation worker
pub struct CacheInvalidator {
    config: CacheInvalidatorConfig,
    shutdown_tx: Arc<RwLock<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl CacheInvalidator {
    /// Create a new cache invalidator
    ///
    /// # Errors
    /// Returns an error if the invalidator cannot be initialized
    pub fn new(config: CacheInvalidatorConfig) -> Result<Self> {
        let (shutdown_tx, _) = tokio::sync::oneshot::channel();

        Ok(Self {
            config,
            shutdown_tx: Arc::new(RwLock::new(Some(shutdown_tx))),
        })
    }

    /// Start the invalidator - subscribes to the cache.invalidate subject
    ///
    /// Returns a handle that can be used to wait for the worker
    ///
    /// # Errors
    /// Returns an error if subscription fails
    pub async fn start(&self) -> Result<JoinHandle<()>> {
        let nats_url = self.config.nats_url.clone();
        let valkey_url = self.config.valkey_url.clone();
        let _shutdown_tx = self.shutdown_tx.clone();

        let handle = tokio::spawn(async move {
            // Connect to NATS
            let nats_conn = match async_nats::connect(&nats_url).await {
                Ok(client) => client,
                Err(e) => {
                    tracing::error!("Failed to connect to NATS: {}", e);
                    return;
                }
            };

            let js = jetstream::new(nats_conn.clone());
            let stream_name = "cache_invalidation";
            let subjects = vec![CACHE_INVALIDATE_SUBJECT.to_string()];

            // Create or get the stream for cache invalidation
            let stream_config = jetstream::stream::Config {
                name: stream_name.to_string(),
                subjects,
                retention: jetstream::stream::RetentionPolicy::WorkQueue,
                max_messages_per_subject: 1000,
                max_age: Duration::from_secs(3600),
                storage: jetstream::stream::StorageType::Memory,
                ..Default::default()
            };

            if let Err(e) = js.create_stream(&stream_config).await {
                tracing::warn!("Stream creation note: {}", e);
            }

            // Get the stream and create consumer
            let stream = match js.get_stream(stream_name).await {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("Failed to get stream: {}", e);
                    return;
                }
            };

            let consumer_config = jetstream::consumer::push::Config {
                durable_name: Some("cache_invalidator".to_string()),
                deliver_policy: jetstream::consumer::DeliverPolicy::All,
                ack_policy: jetstream::consumer::AckPolicy::Explicit,
                max_deliver: 3,
                ..Default::default()
            };

            let consumer = match stream.create_consumer(consumer_config).await {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Failed to create consumer: {}", e);
                    return;
                }
            };

            let mut sub = match consumer.messages().await {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("Failed to get message stream: {}", e);
                    return;
                }
            };

            tracing::info!("Cache invalidator started, listening on {}", CACHE_INVALIDATE_SUBJECT);

            // Process messages
            while let Some(msg_result) = sub.next().await {
                match msg_result {
                    Ok(msg) => {
                        if let Err(e) = process_invalidate_message(&valkey_url, msg).await {
                            tracing::error!("Failed to process cache invalidate message: {}", e);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error receiving message: {}", e);
                    }
                }
            }
        });

        Ok(handle)
    }

    /// Stop the invalidator gracefully
    pub async fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }
    }
}

/// Process a single cache invalidation message
///
/// This function must complete within 500ms as per the AC requirement.
///
/// # Errors
/// Returns an error if message processing fails
async fn process_invalidate_message(valkey_url: &str, msg: async_nats::jetstream::Message) -> Result<()> {
    // Parse the payload
    let payload: CacheInvalidatePayload = serde_json::from_slice(&msg.payload)
        .map_err(|e| anyhow!("Failed to parse cache invalidate payload: {}", e))?;

    tracing::info!("Invalidating cache key: {}", payload.key);

    // Execute with timeout to ensure we meet the 500ms requirement
    let result = timeout(PROCESS_TIMEOUT, delete_key(valkey_url, &payload.key)).await;

    match result {
        Ok(Ok(_)) => {
            tracing::info!("Successfully invalidated cache key: {}", payload.key);
            // Acknowledge the message
            if let Err(e) = msg.ack().await {
                tracing::warn!("Failed to acknowledge message: {}", e);
            }
            Ok(())
        }
        Ok(Err(e)) => {
            tracing::error!("Failed to delete cache key {}: {}", payload.key, e);
            Err(e)
        }
        Err(_) => {
            tracing::error!("Cache deletion timed out for key: {}", payload.key);
            Err(anyhow!("Operation timed out - did not meet 500ms requirement"))
        }
    }
}

/// Delete a key from Valkey
///
/// # Errors
/// Returns an error if the connection fails or the delete operation fails
async fn delete_key(valkey_url: &str, key: &str) -> Result<()> {
    // Parse the URL - handle both valkey and redis schemes
    let redis_url = if let Some(stripped) = valkey_url.strip_prefix("valkey://") {
        stripped
    } else if let Some(stripped) = valkey_url.strip_prefix("redis://") {
        stripped
    } else {
        return Err(anyhow!("Invalid Valkey/Redis URL format"));
    };

    let host_port = if redis_url.contains(':') {
        redis_url.to_string()
    } else {
        format!("{}:6379", redis_url)
    };

    // Create client and delete key
    let client = redis::Client::open(format!("redis://{}", host_port))?;
    let mut conn = client.get_multiplexed_async_connection().await?;

    let deleted: i32 = redis::cmd("DEL").arg(key).query_async(&mut conn).await?;

    if deleted == 1 {
        tracing::debug!("Key {} deleted successfully", key);
    } else {
        tracing::debug!("Key {} did not exist", key);
    }

    Ok(())
}

/// Test helper to expose delete_key for integration tests
#[cfg(any(test, feature = "integration_test"))]
pub async fn test_delete_key(valkey_url: &str, key: &str) -> Result<()> {
    delete_key(valkey_url, key).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constants() {
        assert_eq!(CACHE_INVALIDATE_SUBJECT, "cache.invalidate");
        assert!(PROCESS_TIMEOUT.as_millis() < 500);
    }

    #[test]
    fn test_default_config() {
        let config = CacheInvalidatorConfig::default();
        assert_eq!(config.nats_url, "nats://localhost:4222");
        assert_eq!(config.valkey_url, "redis://localhost:6379");
    }

    #[test]
    fn test_config_builder() {
        let config = CacheInvalidatorConfig::default()
            .with_nats_url("nats://custom:4222")
            .with_valkey_url("redis://custom:6379");
        assert_eq!(config.nats_url, "nats://custom:4222");
        assert_eq!(config.valkey_url, "redis://custom:6379");
    }

    #[test]
    fn test_payload_serialization() {
        let payload = CacheInvalidatePayload {
            key: "cache:biz-123".to_string(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("cache:biz-123"));

        let deserialized: CacheInvalidatePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.key, "cache:biz-123");
    }
}
