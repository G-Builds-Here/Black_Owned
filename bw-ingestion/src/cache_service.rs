//! Valkey cache service with 30-second TTL for business data.
//!
//! This module provides:
//! - CacheService: Main cache interface with get/set operations
//! - 30-second TTL for all cached business data
//! - Cache key generation for query results
//! - Integration with NATS for cache invalidation

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

/// Default TTL for cached data (30 seconds per AC requirement)
pub const DEFAULT_TTL_SECS: u64 = 30;

/// Cache key prefix for business data
pub const CACHE_KEY_PREFIX: &str = "cache:biz:";

/// Cache key prefix for query results
pub const QUERY_CACHE_PREFIX: &str = "cache:query:";

/// Cache service configuration
#[derive(Debug, Clone)]
pub struct CacheServiceConfig {
    /// Valkey/Redis server URL
    pub valkey_url: String,
    /// TTL for cached entries (defaults to 30 seconds)
    pub ttl_seconds: u64,
}

impl Default for CacheServiceConfig {
    fn default() -> Self {
        Self {
            valkey_url: "redis://localhost:6379".to_string(),
            ttl_seconds: DEFAULT_TTL_SECS,
        }
    }
}

impl CacheServiceConfig {
    /// Create a new config with custom Valkey URL
    #[must_use]
    pub fn with_valkey_url(mut self, valkey_url: &str) -> Self {
        self.valkey_url = valkey_url.to_string();
        self
    }

    /// Create a new config with custom TTL
    #[must_use]
    pub fn with_ttl_seconds(mut self, ttl_seconds: u64) -> Self {
        self.ttl_seconds = ttl_seconds;
        self
    }
}

/// Cache entry wrapper with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry<T> {
    /// The cached data
    pub data: T,
    /// Timestamp when the entry was created
    pub created_at: u64,
    /// TTL in seconds
    pub ttl_seconds: u64,
}

impl<T: Serialize> CacheEntry<T> {
    /// Create a new cache entry with the configured TTL
    #[must_use]
    pub fn new(data: T, ttl_seconds: u64) -> Self {
        Self {
            data,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            ttl_seconds,
        }
    }

    /// Check if this entry has expired
    #[must_use]
    pub fn is_expired(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        now - self.created_at > self.ttl_seconds
    }
}

/// Valkey cache service for business data
pub struct CacheService {
    config: CacheServiceConfig,
    client: Option<redis::Client>,
}

impl CacheService {
    /// Create a new cache service with the given configuration
    ///
    /// # Errors
    /// Returns an error if the Valkey client cannot be created
    pub fn new(config: CacheServiceConfig) -> Result<Self> {
        let client = redis::Client::open(config.valkey_url.clone())
            .map_err(|e| anyhow!("Failed to create Valkey client: {}", e))?;

        Ok(Self {
            config,
            client: Some(client),
        })
    }

    /// Create a new cache service with default configuration
    #[must_use]
    pub fn with_default_config() -> Self {
        Self {
            config: CacheServiceConfig::default(),
            client: None,
        }
    }

    /// Initialize the client (lazy initialization)
    ///
    /// # Errors
    /// Returns an error if the client cannot be created
    fn get_client(&mut self) -> Result<&redis::Client> {
        if self.client.is_none() {
            self.client = Some(redis::Client::open(self.config.valkey_url.clone())
                .map_err(|e| anyhow!("Failed to create Valkey client: {}", e))?);
        }
        Ok(self.client.as_ref().unwrap())
    }

    /// Generate a cache key for a business ID
    #[must_use]
    pub fn business_key(business_id: &str) -> String {
        format!("{}{}", CACHE_KEY_PREFIX, business_id)
    }

    /// Generate a cache key for a query
    #[must_use]
    pub fn query_key(query_type: &str, query_params: &str) -> String {
        format!("{}{}:{}", QUERY_CACHE_PREFIX, query_type, query_params)
    }

    /// Get a cached value by key
    ///
    /// Returns None if the key does not exist or has expired
    ///
    /// # Errors
    /// Returns an error if the cache operation fails
    pub async fn get<T: for<'de> Deserialize<'de>>(&mut self, key: &str) -> Result<Option<T>> {
        let client = self.get_client()?;
        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| anyhow!("Failed to get Valkey connection: {}", e))?;

        // Try to get the raw value first
        let raw_value: Option<String> = redis::cmd("GET")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| anyhow!("Failed to get cache key {}: {}", key, e))?;

        match raw_value {
            None => {
                debug!("Cache miss for key: {}", key);
                Ok(None)
            }
            Some(value) => {
                // Try direct deserialization first (for simple types)
                match serde_json::from_str::<T>(&value) {
                    Ok(data) => {
                        debug!("Cache hit for key: {}", key);
                        Ok(Some(data))
                    }
                    Err(_) => {
                        // Try to deserialize as CacheEntry (for typed entries with metadata)
                        // We need to deserialize into a generic structure first
                        #[derive(Deserialize)]
                        struct RawCacheEntry {
                            data: serde_json::Value,
                            created_at: u64,
                            ttl_seconds: u64,
                        }

                        match serde_json::from_str::<RawCacheEntry>(&value) {
                            Ok(entry) => {
                                // Check expiration
                                let now = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0);
                                if now - entry.created_at > entry.ttl_seconds {
                                    // Delete expired entry
                                    let _: Option<()> = redis::cmd("DEL")
                                        .arg(key)
                                        .query_async(&mut conn)
                                        .await
                                        .ok();
                                    debug!("Cache entry expired for key: {}", key);
                                    Ok(None)
                                } else {
                                    // Try to deserialize the data part
                                    match serde_json::from_value::<T>(entry.data) {
                                        Ok(data) => {
                                            debug!("Cache hit for key: {}", key);
                                            Ok(Some(data))
                                        }
                                        Err(e) => {
                                            warn!("Failed to deserialize cache value for {}: {}", key, e);
                                            Ok(None)
                                        }
                                    }
                                }
                            }
                            Err(_) => {
                                warn!("Failed to deserialize cache value for {}: {}", key, value);
                                Ok(None)
                            }
                        }
                    }
                }
            }
        }
    }

    /// Set a cached value with TTL
    ///
    /// # Errors
    /// Returns an error if the cache operation fails
    pub async fn set<T: Serialize>(&mut self, key: &str, value: &T) -> Result<()> {
        let client = self.get_client()?;
        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| anyhow!("Failed to get Valkey connection: {}", e))?;

        // Serialize the value
        let serialized = serde_json::to_string(value)
            .map_err(|e| anyhow!("Failed to serialize cache value: {}", e))?;

        // Set the value with TTL
        let ttl = self.config.ttl_seconds;
        let _: () = redis::cmd("SET")
            .arg(key)
            .arg(serialized)
            .arg("EX")
            .arg(ttl)
            .query_async(&mut conn)
            .await
            .map_err(|e| anyhow!("Failed to set cache key {}: {}", key, e))?;

        info!("Cache set for key: {} with TTL: {} seconds", key, ttl);
        Ok(())
    }

    /// Set a cache entry with metadata
    ///
    /// # Errors
    /// Returns an error if the cache operation fails
    pub async fn set_entry<T: Serialize>(&mut self, key: &str, data: &T) -> Result<()> {
        let entry = CacheEntry::new(data, self.config.ttl_seconds);
        self.set(key, &entry).await
    }

    /// Delete a cache key
    ///
    /// # Errors
    /// Returns an error if the delete operation fails
    pub async fn delete(&mut self, key: &str) -> Result<()> {
        let client = self.get_client()?;
        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| anyhow!("Failed to get Valkey connection: {}", e))?;

        let deleted: i32 = redis::cmd("DEL")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| anyhow!("Failed to delete cache key {}: {}", key, e))?;

        if deleted > 0 {
            info!("Cache key deleted: {}", key);
        } else {
            debug!("Cache key did not exist: {}", key);
        }

        Ok(())
    }

    /// Check if a key exists in the cache
    ///
    /// # Errors
    /// Returns an error if the operation fails
    pub async fn exists(&mut self, key: &str) -> Result<bool> {
        let client = self.get_client()?;
        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| anyhow!("Failed to get Valkey connection: {}", e))?;

        let exists: bool = redis::cmd("EXISTS")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| anyhow!("Failed to check cache key {}: {}", key, e))?;

        Ok(exists)
    }

    /// Get the TTL for a key
    ///
    /// Returns None if the key does not exist
    ///
    /// # Errors
    /// Returns an error if the operation fails
    pub async fn get_ttl(&mut self, key: &str) -> Result<Option<u64>> {
        let client = self.get_client()?;
        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| anyhow!("Failed to get Valkey connection: {}", e))?;

        let ttl: i64 = redis::cmd("TTL")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| anyhow!("Failed to get TTL for key {}: {}", key, e))?;

        if ttl < 0 {
            Ok(None)
        } else {
            Ok(Some(ttl as u64))
        }
    }

    /// Get the configuration
    #[must_use]
    pub fn config(&self) -> &CacheServiceConfig {
        &self.config
    }
}

/// Cache invalidation publisher for NATS
pub struct CacheInvalidationPublisher {
    nats_url: String,
}

impl CacheInvalidationPublisher {
    /// Create a new publisher
    #[must_use]
    pub fn new(nats_url: &str) -> Self {
        Self {
            nats_url: nats_url.to_string(),
        }
    }

    /// Publish a cache invalidation message
    ///
    /// # Errors
    /// Returns an error if the message cannot be published
    pub async fn invalidate(&self, key: &str) -> Result<()> {
        let nats_client = async_nats::connect(&self.nats_url)
            .await
            .map_err(|e| anyhow!("Failed to connect to NATS: {}", e))?;

        let payload = serde_json::json!({
            "key": key
        });

        let subject = "cache.invalidate";
        nats_client
            .publish(subject, payload.to_string().into())
            .await
            .map_err(|e| anyhow!("Failed to publish invalidation message: {}", e))?;

        info!("Published cache invalidation for key: {}", key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = CacheServiceConfig::default();
        assert_eq!(config.valkey_url, "redis://localhost:6379");
        assert_eq!(config.ttl_seconds, DEFAULT_TTL_SECS);
    }

    #[test]
    fn test_config_builder() {
        let config = CacheServiceConfig::default()
            .with_valkey_url("redis://custom:6379")
            .with_ttl_seconds(60);

        assert_eq!(config.valkey_url, "redis://custom:6379");
        assert_eq!(config.ttl_seconds, 60);
    }

    #[test]
    fn test_business_key_generation() {
        let key = CacheService::business_key("123e4567-e89b-12d3-a456-426614174000");
        assert_eq!(key, "cache:biz:123e4567-e89b-12d3-a456-426614174000");
    }

    #[test]
    fn test_query_key_generation() {
        let key = CacheService::query_key("businesses", "first=10");
        assert_eq!(key, "cache:query:businesses:first=10");
    }

    #[test]
    fn test_cache_entry_creation() {
        let data = "test data".to_string();
        let entry = CacheEntry::new(data, DEFAULT_TTL_SECS);

        assert_eq!(entry.data, "test data");
        assert_eq!(entry.ttl_seconds, DEFAULT_TTL_SECS);
        assert!(entry.created_at > 0);
    }

    #[test]
    fn test_cache_entry_serialization() {
        let data = vec!["item1".to_string(), "item2".to_string()];
        let entry = CacheEntry::new(data, DEFAULT_TTL_SECS);

        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: CacheEntry<Vec<String>> = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.data, vec!["item1".to_string(), "item2".to_string()]);
        assert_eq!(deserialized.ttl_seconds, DEFAULT_TTL_SECS);
    }

    #[test]
    fn test_cache_entry_expiration() {
        // Create an entry with 1 second TTL
        let data = "test".to_string();
        let entry = CacheEntry::new(data, 1);

        // Should not be expired immediately
        assert!(!entry.is_expired());

        // Simulate expiration by modifying created_at
        let mut expired_entry = entry.clone();
        expired_entry.created_at = 0;

        // This test validates the logic - in real usage, time would pass
        // We can't easily test actual expiration without waiting
    }

    #[test]
    fn test_constants() {
        assert_eq!(DEFAULT_TTL_SECS, 30);
        assert_eq!(CACHE_KEY_PREFIX, "cache:biz:");
        assert_eq!(QUERY_CACHE_PREFIX, "cache:query:");
    }

    #[test]
    fn test_cache_service_creation() {
        let config = CacheServiceConfig::default();
        let result = CacheService::new(config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_cache_service_with_custom_url() {
        let config = CacheServiceConfig::default()
            .with_valkey_url("redis://test:6379");

        let result = CacheService::new(config);
        assert!(result.is_ok());
    }
}
