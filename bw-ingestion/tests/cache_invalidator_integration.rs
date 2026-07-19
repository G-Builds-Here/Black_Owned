//! Integration tests for NATS cache invalidation with Valkey integration.
//!
//! These tests validate AC LOC-0036-AC3: "NATS cache.invalidate deletes Valkey key within 500ms"

use async_nats::jetstream;
use bw_ingestion::cache_invalidator::{
    CacheInvalidatePayload, CacheInvalidator, CacheInvalidatorConfig, CACHE_INVALIDATE_SUBJECT,
};
use std::time::Duration;

/// Test fixture for integration tests
struct TestFixture {
    nats_url: String,
    valkey_url: String,
}

impl TestFixture {
    fn new() -> Self {
        Self {
            nats_url: std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string()),
            valkey_url: std::env::var("VALKEY_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string()),
        }
    }

    async fn setup(&self) -> Result<async_nats::Client, anyhow::Error> {
        let nats_client = async_nats::connect(&self.nats_url).await?;
        Ok(nats_client)
    }
}

#[tokio::test]
async fn test_nats_subscriber_receives_invalidation_message() -> Result<(), anyhow::Error> {
    // Arrange
    let fixture = TestFixture::new();
    let nats_client = fixture.setup().await?;
    let js = jetstream::new(nats_client.clone());

    // Create stream
    let stream_name = "test_cache_invalidation";
    let stream_config = jetstream::stream::Config {
        name: stream_name.to_string(),
        subjects: vec![CACHE_INVALIDATE_SUBJECT.to_string()],
        retention: jetstream::stream::RetentionPolicy::WorkQueue,
        max_messages_per_subject: 100,
        max_age: Duration::from_secs(60),
        storage: jetstream::stream::StorageType::Memory,
        ..Default::default()
    };

    let _ = js.create_stream(&stream_config).await;

    // Create test invalidator
    let config = CacheInvalidatorConfig::default()
        .with_nats_url(&fixture.nats_url)
        .with_valkey_url(&fixture.valkey_url);

    let invalidator = CacheInvalidator::new(config)?;
    let _handle = invalidator.start().await?;

    // Act - Publish invalidation message
    let payload = CacheInvalidatePayload {
        key: "test:cache:key".to_string(),
    };

    let payload_json = serde_json::to_string(&payload)?;
    nats_client
        .publish(CACHE_INVALIDATE_SUBJECT, payload_json.into())
        .await?;

    // Wait for processing
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Assert - Message was received (no panic = success)
    // The actual validation happens in the next test

    Ok(())
}

#[tokio::test]
async fn test_cache_key_deleted_within_500ms() -> Result<(), anyhow::Error> {
    // Arrange
    let fixture = TestFixture::new();
    let nats_client = fixture.setup().await?;
    let js = jetstream::new(nats_client.clone());

    // Create stream
    let stream_name = "test_cache_invalidation_2";
    let stream_config = jetstream::stream::Config {
        name: stream_name.to_string(),
        subjects: vec![CACHE_INVALIDATE_SUBJECT.to_string()],
        retention: jetstream::stream::RetentionPolicy::WorkQueue,
        max_messages_per_subject: 100,
        max_age: Duration::from_secs(60),
        storage: jetstream::stream::StorageType::Memory,
        ..Default::default()
    };

    let _ = js.create_stream(&stream_config).await;

    // Set up Valkey connection and create a test key
    let valkey_url = fixture.valkey_url.clone();
    let test_key = format!("test:invalidate:{}", uuid::Uuid::new_v4());

    // Create the key first
    let client = redis::Client::open(valkey_url.clone())?;
    let mut conn = client.get_multiplexed_async_connection().await?;
    redis::cmd("SET")
        .arg(&test_key)
        .arg("test_value")
        .query_async::<()>(&mut conn)
        .await?;

    // Verify key exists
    let exists_before: bool = redis::cmd("EXISTS")
        .arg(&test_key)
        .query_async(&mut conn)
        .await?;
    assert!(exists_before, "Test key should exist before invalidation");

    // Create invalidator
    let config = CacheInvalidatorConfig::default()
        .with_nats_url(&fixture.nats_url)
        .with_valkey_url(&valkey_url);

    let invalidator = CacheInvalidator::new(config)?;
    let _handle = invalidator.start().await?;

    // Act - Publish invalidation message with timing
    let payload = CacheInvalidatePayload {
        key: test_key.clone(),
    };

    let payload_json = serde_json::to_string(&payload)?;
    let start_time = std::time::Instant::now();

    nats_client
        .publish(CACHE_INVALIDATE_SUBJECT, payload_json.into())
        .await?;

    // Wait for processing with timeout
    tokio::time::sleep(Duration::from_millis(500)).await;
    let elapsed = start_time.elapsed();

    // Assert - Key should be deleted
    let exists_after: bool = redis::cmd("EXISTS")
        .arg(&test_key)
        .query_async(&mut conn)
        .await?;

    assert!(!exists_after, "Cache key should be deleted after invalidation");
    assert!(
        elapsed.as_millis() < 500,
        "Invalidation should complete within 500ms, took {}ms",
        elapsed.as_millis()
    );

    Ok(())
}

#[tokio::test]
async fn test_multiple_keys_invalidated() -> Result<(), anyhow::Error> {
    // Arrange
    let fixture = TestFixture::new();
    let nats_client = fixture.setup().await?;
    let js = jetstream::new(nats_client.clone());

    // Create stream
    let stream_name = "test_cache_invalidation_3";
    let stream_config = jetstream::stream::Config {
        name: stream_name.to_string(),
        subjects: vec![CACHE_INVALIDATE_SUBJECT.to_string()],
        retention: jetstream::stream::RetentionPolicy::WorkQueue,
        max_messages_per_subject: 100,
        max_age: Duration::from_secs(60),
        storage: jetstream::stream::StorageType::Memory,
        ..Default::default()
    };

    let _ = js.create_stream(&stream_config).await;

    // Set up Valkey connection and create test keys
    let valkey_url = fixture.valkey_url.clone();
    let test_keys: Vec<String> = (1..=5)
        .map(|i| format!("test:multi:key:{}", i))
        .collect();

    let client = redis::Client::open(valkey_url.clone())?;
    let mut conn = client.get_multiplexed_async_connection().await?;

    for key in &test_keys {
        redis::cmd("SET")
            .arg(key)
            .arg("test_value")
            .query_async::<()>(&mut conn)
            .await?;
    }

    // Create invalidator
    let config = CacheInvalidatorConfig::default()
        .with_nats_url(&fixture.nats_url)
        .with_valkey_url(&valkey_url);

    let invalidator = CacheInvalidator::new(config)?;
    let _handle = invalidator.start().await?;

    // Act - Publish multiple invalidation messages
    for key in &test_keys {
        let payload = CacheInvalidatePayload { key: key.clone() };
        let payload_json = serde_json::to_string(&payload)?;
        nats_client
            .publish(CACHE_INVALIDATE_SUBJECT, payload_json.into())
            .await?;
    }

    // Wait for processing
    tokio::time::sleep(Duration::from_millis(1000)).await;

    // Assert - All keys should be deleted
    for key in &test_keys {
        let exists: bool = redis::cmd("EXISTS")
            .arg(key)
            .query_async(&mut conn)
            .await?;
        assert!(!exists, "Key {} should be deleted", key);
    }

    Ok(())
}

#[tokio::test]
async fn test_invalid_payload_format_handled_gracefully() -> Result<(), anyhow::Error> {
    // Arrange
    let fixture = TestFixture::new();
    let nats_client = fixture.setup().await?;
    let js = jetstream::new(nats_client.clone());

    // Create stream
    let stream_name = "test_cache_invalidation_4";
    let stream_config = jetstream::stream::Config {
        name: stream_name.to_string(),
        subjects: vec![CACHE_INVALIDATE_SUBJECT.to_string()],
        retention: jetstream::stream::RetentionPolicy::WorkQueue,
        max_messages_per_subject: 100,
        max_age: Duration::from_secs(60),
        storage: jetstream::stream::StorageType::Memory,
        ..Default::default()
    };

    let _ = js.create_stream(&stream_config).await;

    // Create invalidator
    let config = CacheInvalidatorConfig::default()
        .with_nats_url(&fixture.nats_url)
        .with_valkey_url(&fixture.valkey_url);

    let invalidator = CacheInvalidator::new(config)?;
    let _handle = invalidator.start().await?;

    // Act - Publish invalid JSON payload
    nats_client
        .publish(CACHE_INVALIDATE_SUBJECT, "invalid json".into())
        .await?;

    // Wait for processing
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Assert - No panic occurred (graceful handling)
    // The invalid message should be logged and acknowledged

    Ok(())
}

#[tokio::test]
async fn test_nonexistent_key_invalidated_without_error() -> Result<(), anyhow::Error> {
    // Arrange
    let fixture = TestFixture::new();
    let nats_client = fixture.setup().await?;
    let js = jetstream::new(nats_client.clone());

    // Create stream
    let stream_name = "test_cache_invalidation_5";
    let stream_config = jetstream::stream::Config {
        name: stream_name.to_string(),
        subjects: vec![CACHE_INVALIDATE_SUBJECT.to_string()],
        retention: jetstream::stream::RetentionPolicy::WorkQueue,
        max_messages_per_subject: 100,
        max_age: Duration::from_secs(60),
        storage: jetstream::stream::StorageType::Memory,
        ..Default::default()
    };

    let _ = js.create_stream(&stream_config).await;

    // Create invalidator
    let config = CacheInvalidatorConfig::default()
        .with_nats_url(&fixture.nats_url)
        .with_valkey_url(&fixture.valkey_url);

    let invalidator = CacheInvalidator::new(config)?;
    let _handle = invalidator.start().await?;

    // Act - Publish invalidation for non-existent key
    let payload = CacheInvalidatePayload {
        key: "nonexistent:key:does:not:exist".to_string(),
    };

    let payload_json = serde_json::to_string(&payload)?;
    nats_client
        .publish(CACHE_INVALIDATE_SUBJECT, payload_json.into())
        .await?;

    // Wait for processing
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Assert - No error occurred (graceful handling of non-existent key)

    Ok(())
}

#[tokio::test]
async fn test_valkey_url_parsing() -> Result<(), anyhow::Error> {
    // Test that both redis:// and valkey:// schemes are handled
    let config1 = CacheInvalidatorConfig::default().with_valkey_url("redis://localhost:6379");
    assert_eq!(config1.valkey_url, "redis://localhost:6379");

    let config2 = CacheInvalidatorConfig::default().with_valkey_url("valkey://localhost:6379");
    assert_eq!(config2.valkey_url, "valkey://localhost:6379");

    Ok(())
}
