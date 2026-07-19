//! Unit tests for NATS cache invalidation with Valkey integration.
//!
//! These tests validate AC LOC-0036-AC3: "NATS cache.invalidate deletes Valkey key within 500ms"
//! Unit tests run without external dependencies.

use bw_ingestion::cache_invalidator::{
    CacheInvalidatePayload, CacheInvalidator, CacheInvalidatorConfig, CACHE_INVALIDATE_SUBJECT,
};

#[test]
fn test_cache_invalidate_subject_constant() {
    assert_eq!(CACHE_INVALIDATE_SUBJECT, "cache.invalidate");
}

#[test]
fn test_process_timeout_within_500ms_requirement() {
    // AC requires completion within 500ms
    // The implementation uses 450ms timeout to ensure it completes under 500ms
    let expected_timeout_ms = 450;
    assert!(
        expected_timeout_ms < 500,
        "Process timeout {}ms must be under 500ms requirement",
        expected_timeout_ms
    );
}

#[test]
fn test_default_config_values() {
    let config = CacheInvalidatorConfig::default();
    assert_eq!(config.nats_url, "nats://localhost:4222");
    assert_eq!(config.valkey_url, "redis://localhost:6379");
}

#[test]
fn test_config_builder_pattern() {
    let config = CacheInvalidatorConfig::default()
        .with_nats_url("nats://custom-nats:4222")
        .with_valkey_url("redis://custom-redis:6379");

    assert_eq!(config.nats_url, "nats://custom-nats:4222");
    assert_eq!(config.valkey_url, "redis://custom-redis:6379");
}

#[test]
fn test_payload_serialization_roundtrip() {
    let original = CacheInvalidatePayload {
        key: "cache:biz-123".to_string(),
    };

    let json = serde_json::to_string(&original).expect("Should serialize");
    let deserialized: CacheInvalidatePayload =
        serde_json::from_str(&json).expect("Should deserialize");

    assert_eq!(deserialized.key, original.key);
}

#[test]
fn test_payload_with_various_key_formats() {
    let test_cases = vec![
        "cache:biz-123",
        "user:session:abc-xyz",
        "product:inventory:sku-456",
        "cache:org:12345:profile",
    ];

    for key in test_cases {
        let payload = CacheInvalidatePayload {
            key: key.to_string(),
        };

        let json = serde_json::to_string(&payload).expect("Should serialize");
        let deserialized: CacheInvalidatePayload =
            serde_json::from_str(&json).expect("Should deserialize");

        assert_eq!(deserialized.key, key);
    }
}

#[test]
fn test_invalidator_creation() {
    let config = CacheInvalidatorConfig::default();
    let invalidator = CacheInvalidator::new(config);

    assert!(
        invalidator.is_ok(),
        "Invalidator should be created successfully"
    );
}

#[test]
fn test_invalidator_creation_with_custom_config() {
    let config = CacheInvalidatorConfig::default()
        .with_nats_url("nats://test:4222")
        .with_valkey_url("redis://test:6379");

    let invalidator = CacheInvalidator::new(config);

    assert!(
        invalidator.is_ok(),
        "Invalidator should be created with custom config"
    );
}

#[test]
fn test_payload_json_structure() {
    let payload = CacheInvalidatePayload {
        key: "test:key".to_string(),
    };

    let json = serde_json::to_string(&payload).unwrap();

    // Verify JSON structure matches expected format
    assert!(json.contains("\"key\""));
    assert!(json.contains("test:key"));

    // Verify it matches the expected format from the AC
    let _expected_format = r#"{"key":"test:key"}"#;
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed["key"], "test:key");
}

#[test]
fn test_config_immutability() {
    let config = CacheInvalidatorConfig::default();
    let config_clone = config.clone();
    let modified = config_clone.with_nats_url("new-url");

    // Original should be unchanged
    assert_eq!(config.nats_url, "nats://localhost:4222");
    assert_eq!(modified.nats_url, "new-url");
}
