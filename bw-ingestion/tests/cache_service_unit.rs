//! Unit tests for Valkey cache service with 30-second TTL.
//!
//! These tests validate AC LOC-0036-AC2: "Response cache returns cached results within TTL"
//! Unit tests verify cache service logic without external dependencies.

use bw_ingestion::cache_service::{
    CacheEntry, CacheService, CacheServiceConfig, CACHE_KEY_PREFIX, DEFAULT_TTL_SECS,
    QUERY_CACHE_PREFIX,
};

#[test]
fn test_default_ttl_is_30_seconds() {
    // AC requires 30-second TTL
    assert_eq!(DEFAULT_TTL_SECS, 30);
}

#[test]
fn test_default_config_values() {
    let config = CacheServiceConfig::default();
    assert_eq!(config.valkey_url, "redis://localhost:6379");
    assert_eq!(config.ttl_seconds, DEFAULT_TTL_SECS);
}

#[test]
fn test_config_builder_pattern() {
    let config = CacheServiceConfig::default()
        .with_valkey_url("redis://custom:6379")
        .with_ttl_seconds(60);

    assert_eq!(config.valkey_url, "redis://custom:6379");
    assert_eq!(config.ttl_seconds, 60);
}

#[test]
fn test_business_key_generation() {
    let business_id = "123e4567-e89b-12d3-a456-426614174000";
    let key = CacheService::business_key(business_id);

    assert_eq!(key, format!("{}{}", CACHE_KEY_PREFIX, business_id));
    assert!(key.starts_with(CACHE_KEY_PREFIX));
}

#[test]
fn test_query_key_generation() {
    let key = CacheService::query_key("businesses", "first=10&after=abc");

    assert_eq!(key, "cache:query:businesses:first=10&after=abc");
    assert!(key.starts_with(QUERY_CACHE_PREFIX));
}

#[test]
fn test_cache_entry_creation() {
    let data = vec!["item1".to_string(), "item2".to_string()];
    let entry = CacheEntry::new(data.clone(), DEFAULT_TTL_SECS);

    assert_eq!(entry.data, data);
    assert_eq!(entry.ttl_seconds, DEFAULT_TTL_SECS);
    assert!(entry.created_at > 0);
}

#[test]
fn test_cache_entry_serialization_roundtrip() {
    let data = vec![
        ("key1".to_string(), "value1".to_string()),
        ("key2".to_string(), "value2".to_string()),
    ];
    let entry = CacheEntry::new(data.clone(), DEFAULT_TTL_SECS);

    let json = serde_json::to_string(&entry).expect("Should serialize");
    let deserialized: CacheEntry<Vec<(String, String)>> =
        serde_json::from_str(&json).expect("Should deserialize");

    assert_eq!(deserialized.data, data);
    assert_eq!(deserialized.ttl_seconds, DEFAULT_TTL_SECS);
}

#[test]
fn test_cache_entry_not_expired_immediately() {
    let data = "test".to_string();
    let entry = CacheEntry::new(data, DEFAULT_TTL_SECS);

    // Entry should not be expired immediately after creation
    assert!(!entry.is_expired());
}

#[test]
fn test_cache_entry_expiration_logic() {
    // Create entry with 1 second TTL
    let data = "test".to_string();
    let mut entry = CacheEntry::new(data, 1);

    // Not expired initially
    assert!(!entry.is_expired());

    // Simulate old entry by setting created_at to 0
    entry.created_at = 0;

    // Should be expired now (current time > 1 second)
    assert!(entry.is_expired());
}

#[test]
fn test_cache_entry_with_custom_ttl() {
    let data = "test".to_string();
    let entry = CacheEntry::new(data, 60);

    assert_eq!(entry.ttl_seconds, 60);
    assert!(!entry.is_expired());
}

#[test]
fn test_cache_service_creation_with_default_config() {
    let config = CacheServiceConfig::default();
    let result = CacheService::new(config);

    assert!(result.is_ok(), "Cache service should be created successfully");
}

#[test]
fn test_cache_service_creation_with_custom_config() {
    let config = CacheServiceConfig::default()
        .with_valkey_url("redis://test:6379")
        .with_ttl_seconds(60);

    let result = CacheService::new(config);
    assert!(result.is_ok());
}

#[test]
fn test_cache_service_config_accessor() {
    let config = CacheServiceConfig::default()
        .with_valkey_url("redis://custom:6379")
        .with_ttl_seconds(45);

    let service = CacheService::new(config.clone()).unwrap();
    let service_config = service.config();

    assert_eq!(service_config.valkey_url, "redis://custom:6379");
    assert_eq!(service_config.ttl_seconds, 45);
}

#[test]
fn test_cache_key_prefix_constants() {
    assert_eq!(CACHE_KEY_PREFIX, "cache:biz:");
    assert_eq!(QUERY_CACHE_PREFIX, "cache:query:");
}

#[test]
fn test_business_key_with_various_formats() {
    let test_cases = vec![
        "123e4567-e89b-12d3-a456-426614174000",
        "simple-id",
        "id-with-dashes",
        "id_with_underscores",
    ];

    for business_id in test_cases {
        let key = CacheService::business_key(business_id);
        assert_eq!(key, format!("{}{}", CACHE_KEY_PREFIX, business_id));
    }
}

#[test]
fn test_query_key_with_various_params() {
    let test_cases = vec![
        ("businesses", "first=10"),
        ("businesses", "first=10&after=abc"),
        ("search", "query=test"),
        ("reviews", "business_id=123"),
    ];

    for (query_type, params) in test_cases {
        let key = CacheService::query_key(query_type, params);
        assert!(key.starts_with(QUERY_CACHE_PREFIX));
        assert!(key.contains(query_type));
        assert!(key.contains(params));
    }
}

#[test]
fn test_cache_entry_json_structure() {
    let data = "test_value".to_string();
    let entry = CacheEntry::new(data, DEFAULT_TTL_SECS);

    let json = serde_json::to_string(&entry).unwrap();

    // Verify JSON structure
    assert!(json.contains("\"data\""));
    assert!(json.contains("\"created_at\""));
    assert!(json.contains("\"ttl_seconds\""));
    assert!(json.contains("test_value"));
}

#[test]
fn test_cache_entry_immutability() {
    let data = "original".to_string();
    let entry = CacheEntry::new(data, DEFAULT_TTL_SECS);

    // Clone and modify
    let mut modified = entry.clone();
    modified.ttl_seconds = 60;

    // Original should be unchanged
    assert_eq!(entry.ttl_seconds, DEFAULT_TTL_SECS);
    assert_eq!(modified.ttl_seconds, 60);
}
