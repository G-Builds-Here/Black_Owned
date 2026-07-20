//! Integration tests for Valkey cache service with 30-second TTL.
//!
//! These tests validate AC LOC-0036-AC2: "Response cache returns cached results within TTL"
//! Integration tests verify cache operations with actual Valkey connection.

use bw_ingestion::cache_service::{CacheEntry, CacheService, CacheServiceConfig};

/// Test fixture for integration tests
struct TestFixture {
    cache_service: CacheService,
}

impl TestFixture {
    fn new() -> Self {
        let valkey_url =
            std::env::var("VALKEY_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());

        let config = CacheServiceConfig::default().with_valkey_url(&valkey_url);
        let cache_service = CacheService::new(config).expect("Failed to create cache service");

        Self { cache_service }
    }
}

#[tokio::test]
async fn test_cache_set_and_get() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let key = "test:integration:key";
    let data = vec!["item1".to_string(), "item2".to_string()];

    // Act - Set cache
    fixture
        .cache_service
        .set(key, &data)
        .await
        .expect("Should set cache");

    // Act - Get cache
    let result: Option<Vec<String>> = fixture
        .cache_service
        .get(key)
        .await
        .expect("Should get cache");

    // Assert
    assert!(result.is_some(), "Cache should have value");
    assert_eq!(result.unwrap(), data);

    Ok(())
}

#[tokio::test]
async fn test_cache_miss_for_nonexistent_key() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let key = "test:nonexistent:key";

    // Ensure key doesn't exist
    let _ = fixture.cache_service.delete(key).await;

    // Act
    let result: Option<String> = fixture
        .cache_service
        .get(key)
        .await
        .expect("Should get cache");

    // Assert
    assert!(result.is_none(), "Cache should be empty for nonexistent key");

    Ok(())
}

#[tokio::test]
async fn test_cache_entry_with_ttl() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let key = "test:ttl:key";
    let data = "test_value".to_string();

    // Act - Set entry with TTL
    fixture
        .cache_service
        .set_entry(key, &data)
        .await
        .expect("Should set cache entry");

    // Assert - Check TTL exists
    let ttl = fixture
        .cache_service
        .get_ttl(key)
        .await
        .expect("Should get TTL");

    assert!(ttl.is_some(), "TTL should be set");
    assert!(
        ttl.unwrap() <= 30,
        "TTL should be at most 30 seconds"
    );

    Ok(())
}

#[tokio::test]
async fn test_cache_delete() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let key = "test:delete:key";
    let data = "test_value".to_string();

    // Set cache
    fixture
        .cache_service
        .set(key, &data)
        .await
        .expect("Should set cache");

    // Verify exists
    let exists = fixture
        .cache_service
        .exists(key)
        .await
        .expect("Should check existence");
    assert!(exists, "Key should exist before deletion");

    // Act - Delete
    fixture
        .cache_service
        .delete(key)
        .await
        .expect("Should delete cache");

    // Assert - Key should not exist
    let exists_after = fixture
        .cache_service
        .exists(key)
        .await
        .expect("Should check existence after delete");
    assert!(!exists_after, "Key should not exist after deletion");

    Ok(())
}

#[tokio::test]
async fn test_cache_exists() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let key = "test:exists:key";
    let data = "test_value".to_string();

    // Act - Set and check
    fixture
        .cache_service
        .set(key, &data)
        .await
        .expect("Should set cache");

    let exists = fixture
        .cache_service
        .exists(key)
        .await
        .expect("Should check existence");

    // Assert
    assert!(exists, "Key should exist");

    Ok(())
}

#[tokio::test]
async fn test_cache_business_key_pattern() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let business_id = "123e4567-e89b-12d3-a456-426614174000";
    let key = CacheService::business_key(business_id);
    let business_data = serde_json::json!({
        "id": business_id,
        "name": "Test Business",
        "category": "tech"
    });

    // Act
    fixture
        .cache_service
        .set(&key, &business_data)
        .await
        .expect("Should set cache");

    let result: Option<serde_json::Value> = fixture
        .cache_service
        .get(&key)
        .await
        .expect("Should get cache");

    // Assert
    assert!(result.is_some());
    assert_eq!(result.unwrap()["name"], "Test Business");

    Ok(())
}

#[tokio::test]
async fn test_cache_query_key_pattern() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let query_key = CacheService::query_key("businesses", "first=10");
    let query_result = vec![
        serde_json::json!({"id": "1", "name": "Business 1"}),
        serde_json::json!({"id": "2", "name": "Business 2"}),
    ];

    // Act
    fixture
        .cache_service
        .set(&query_key, &query_result)
        .await
        .expect("Should set cache");

    let result: Option<Vec<serde_json::Value>> = fixture
        .cache_service
        .get(&query_key)
        .await
        .expect("Should get cache");

    // Assert
    assert!(result.is_some());
    let results = result.unwrap();
    assert_eq!(results.len(), 2);
    assert_eq!(results[0]["name"], "Business 1");

    Ok(())
}

#[tokio::test]
async fn test_cache_overwrite_existing_key() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let key = "test:overwrite:key";
    let data1 = "original_value".to_string();
    let data2 = "new_value".to_string();

    // Set initial value
    fixture
        .cache_service
        .set(key, &data1)
        .await
        .expect("Should set cache");

    // Act - Overwrite
    fixture
        .cache_service
        .set(key, &data2)
        .await
        .expect("Should overwrite cache");

    // Assert
    let result: Option<String> = fixture
        .cache_service
        .get(key)
        .await
        .expect("Should get cache");

    assert_eq!(result, Some(data2));

    Ok(())
}

#[tokio::test]
async fn test_cache_entry_structured_data() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();
    let key = "test:entry:key";
    let entry = CacheEntry::new(
        vec!["item1".to_string(), "item2".to_string()],
        30,
    );

    // Act
    fixture
        .cache_service
        .set(key, &entry)
        .await
        .expect("Should set cache entry");

    let result: Option<CacheEntry<Vec<String>>> = fixture
        .cache_service
        .get(key)
        .await
        .expect("Should get cache entry");

    // Assert
    assert!(result.is_some());
    let entry = result.unwrap();
    assert_eq!(entry.data, vec!["item1".to_string(), "item2".to_string()]);
    assert_eq!(entry.ttl_seconds, 30);

    Ok(())
}

#[tokio::test]
async fn test_multiple_cache_operations() -> Result<(), anyhow::Error> {
    // Arrange
    let mut fixture = TestFixture::new();

    // Set multiple keys
    let keys = vec![
        ("multi:key:1", "value1"),
        ("multi:key:2", "value2"),
        ("multi:key:3", "value3"),
    ];

    // Act - Set all keys
    for (key, value) in &keys {
        fixture
            .cache_service
            .set(key, value)
            .await
            .expect("Should set cache");
    }

    // Assert - Get all keys
    for (key, expected_value) in &keys {
        let result: Option<String> = fixture
            .cache_service
            .get(key)
            .await
            .expect("Should get cache");

        assert_eq!(result, Some(expected_value.to_string()));
    }

    Ok(())
}

#[tokio::test]
async fn test_cache_with_custom_ttl() -> Result<(), anyhow::Error> {
    // Arrange
    let valkey_url =
        std::env::var("VALKEY_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());

    let config = CacheServiceConfig::default()
        .with_valkey_url(&valkey_url)
        .with_ttl_seconds(60);

    let mut cache_service = CacheService::new(config).expect("Should create cache service");

    let key = "test:custom:ttl:key";
    let data = "test_value".to_string();

    // Act
    cache_service
        .set(key, &data)
        .await
        .expect("Should set cache");

    let ttl = cache_service
        .get_ttl(key)
        .await
        .expect("Should get TTL");

    // Assert
    assert!(ttl.is_some());
    assert!(ttl.unwrap() <= 60);

    Ok(())
}
