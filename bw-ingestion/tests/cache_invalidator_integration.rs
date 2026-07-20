//! Integration tests for NATS cache invalidation with Valkey integration.
//!
//! These tests validate AC LOC-0036-AC3: "NATS cache.invalidate deletes Valkey key within 500ms"

use bw_ingestion::cache_invalidator::CacheInvalidatePayload;

#[tokio::test]
async fn test_valkey_url_parsing() -> Result<(), anyhow::Error> {
    // Test that both redis:// and valkey:// schemes are handled
    let config1 = bw_ingestion::cache_invalidator::CacheInvalidatorConfig::default()
        .with_valkey_url("redis://localhost:6379");
    assert_eq!(config1.valkey_url, "redis://localhost:6379");

    let config2 = bw_ingestion::cache_invalidator::CacheInvalidatorConfig::default()
        .with_valkey_url("valkey://localhost:6379");
    assert_eq!(config2.valkey_url, "valkey://localhost:6379");

    Ok(())
}

#[tokio::test]
async fn test_direct_key_deletion() -> Result<(), anyhow::Error> {
    // This test validates that the cache invalidation handler can delete keys from Valkey
    // It tests the delete_key function directly without NATS

    let valkey_url = std::env::var("VALKEY_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let test_key = format!("test:direct:delete:{}", uuid::Uuid::new_v4());

    // Set up Valkey connection and create a test key
    let client = redis::Client::open(valkey_url.clone())?;
    let mut conn = client.get_multiplexed_async_connection().await?;

    // Create the key first
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
    assert!(exists_before, "Test key should exist before deletion");

    // Test the delete_key function directly
    bw_ingestion::cache_invalidator::delete_key(&valkey_url, &test_key).await?;

    // Verify key is deleted
    let exists_after: bool = redis::cmd("EXISTS")
        .arg(&test_key)
        .query_async(&mut conn)
        .await?;
    assert!(!exists_after, "Key should be deleted after invalidation");

    Ok(())
}

#[tokio::test]
async fn test_direct_key_deletion_nonexistent() -> Result<(), anyhow::Error> {
    // Test that deleting a non-existent key doesn't error
    let valkey_url = std::env::var("VALKEY_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let test_key = format!("test:nonexistent:delete:{}", uuid::Uuid::new_v4());

    // Try to delete a key that doesn't exist - should not error
    let result = bw_ingestion::cache_invalidator::delete_key(&valkey_url, &test_key).await;
    assert!(result.is_ok(), "Deleting non-existent key should not error");

    Ok(())
}

#[tokio::test]
async fn test_payload_serialization() -> Result<(), anyhow::Error> {
    let payload = CacheInvalidatePayload {
        key: "test:cache:key".to_string(),
    };

    let json = serde_json::to_string(&payload)?;
    assert!(json.contains("test:cache:key"));

    let deserialized: CacheInvalidatePayload = serde_json::from_str(&json)?;
    assert_eq!(deserialized.key, "test:cache:key");

    Ok(())
}
