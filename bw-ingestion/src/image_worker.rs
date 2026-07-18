//! NATS consumer worker for image processing.
//!
//! This module provides a BackgroundService-style worker that subscribes to
//! the `image.process` subject and processes image thumbnail generation requests.

use crate::image_processor::{ImageProcessRequest, ImageProcessor};
use anyhow::{anyhow, Result};
use async_nats::jetstream;
use futures::StreamExt;
use std::sync::Arc;
use tokio::{sync::RwLock, task::JoinHandle, time::{timeout, Duration}};

/// NATS subject for image processing requests
pub const IMAGE_PROCESS_SUBJECT: &str = "image.process";

/// Dead-letter queue subject for failed messages
pub const IMAGE_PROCESS_DLQ: &str = "image.process.dlq";

/// Maximum retry attempts before sending to DLQ
const MAX_RETRIES: i64 = 3;

/// Message processing timeout
const PROCESS_TIMEOUT: Duration = Duration::from_secs(30);

/// Image processing worker state
pub struct ImageWorker {
    processor: Arc<ImageProcessor>,
    nats_conn: async_nats::Client,
    shutdown_tx: Arc<RwLock<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl ImageWorker {
    /// Create a new image processing worker
    ///
    /// # Errors
    /// Returns an error if the worker cannot be initialized
    pub fn new(
        nats_conn: async_nats::Client,
        processor: Arc<ImageProcessor>,
    ) -> Result<Self> {
        let (shutdown_tx, _) = tokio::sync::oneshot::channel();

        Ok(Self {
            processor,
            nats_conn,
            shutdown_tx: Arc::new(RwLock::new(Some(shutdown_tx))),
        })
    }

    /// Start the worker - subscribes to the image.process subject
    ///
    /// Returns a handle that can be used to wait for the worker
    ///
    /// # Errors
    /// Returns an error if subscription fails
    pub async fn start(&self) -> Result<JoinHandle<()>> {
        let js = jetstream::new(self.nats_conn.clone());
        let processor = self.processor.clone();
        let _shutdown_tx = self.shutdown_tx.clone();

        let handle = tokio::spawn(async move {
            let stream_name = "image_processing";
            let subjects = vec![IMAGE_PROCESS_SUBJECT.to_string()];

            // Create or get the stream for image processing
            let stream_config = crate::stream_config::stream_config(&stream_name, &subjects);
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

            // Use push consumer config for message streaming
            let consumer_config = async_nats::jetstream::consumer::push::Config {
                durable_name: Some("image_processor".to_string()),
                deliver_policy: async_nats::jetstream::consumer::DeliverPolicy::All,
                ack_policy: async_nats::jetstream::consumer::AckPolicy::Explicit,
                max_deliver: MAX_RETRIES,
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

            tracing::info!("Image worker started, listening on {}", IMAGE_PROCESS_SUBJECT);

            // Process messages
            while let Some(msg_result) = sub.next().await {
                match msg_result {
                    Ok(msg) => {
                        if let Err(e) = process_message(&processor, msg).await {
                            tracing::error!("Failed to process image message: {}", e);
                            // Message will be redelivered up to max_deliver times
                            // then sent to DLQ automatically by NATS
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

    /// Stop the worker gracefully
    pub async fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }
    }
}

/// Process a single NATS message
///
/// # Errors
/// Returns an error if message processing fails
async fn process_message(
    processor: &ImageProcessor,
    msg: async_nats::jetstream::Message,
) -> Result<()> {
    // Parse the request payload
    let request: ImageProcessRequest = serde_json::from_slice(&msg.payload)
        .map_err(|e| anyhow!("Failed to parse message payload: {}", e))?;

    tracing::info!("Processing image: {}", request.source_path);

    // Process with timeout
    let result = timeout(PROCESS_TIMEOUT, processor.process_request(&request))
        .await
        .map_err(|_| anyhow!("Processing timed out"))?;

    match result {
        Ok(process_result) => {
            tracing::info!(
                "Successfully generated thumbnails: {:?}",
                process_result.thumbnails_generated
            );
            // Acknowledge the message
            if let Err(e) = msg.ack().await {
                tracing::warn!("Failed to acknowledge message: {}", e);
            }
            Ok(())
        }
        Err(e) => {
            tracing::warn!("Failed to process image {}: {}", request.source_path, e);
            // Nack the message - NATS will redeliver up to max_deliver times
            Err(e)
        }
    }
}

/// Configuration for the image worker
#[derive(Debug, Clone)]
pub struct ImageWorkerConfig {
    /// NATS server URL
    pub nats_url: String,
    /// MinIO URL
    pub minio_url: String,
    /// MinIO access key
    pub minio_access_key: String,
    /// MinIO secret key
    pub minio_secret_key: String,
    /// Default bucket name for storing images
    pub bucket_name: String,
}

impl Default for ImageWorkerConfig {
    fn default() -> Self {
        Self {
            nats_url: "nats://localhost:4222".to_string(),
            minio_url: "http://localhost:9000".to_string(),
            minio_access_key: "minioadmin".to_string(),
            minio_secret_key: "minioadmin".to_string(),
            bucket_name: "images".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subject_constants() {
        assert_eq!(IMAGE_PROCESS_SUBJECT, "image.process");
        assert_eq!(IMAGE_PROCESS_DLQ, "image.process.dlq");
    }

    #[test]
    fn test_default_config() {
        let config = ImageWorkerConfig::default();
        assert_eq!(config.nats_url, "nats://localhost:4222");
        assert_eq!(config.minio_url, "http://localhost:9000");
        assert_eq!(config.bucket_name, "images");
    }
}
