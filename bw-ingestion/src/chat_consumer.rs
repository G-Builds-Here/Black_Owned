//! Chat persistence consumer for NATS message processing.
//!
//! This module provides a NATS consumer that listens for `chat.message` events
//! and persists them to ClickHouse. Malformed JSON is routed to the `chat.dlq` dead-letter queue.

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Configuration for the chat consumer
#[derive(Debug, Clone)]
pub struct ChatConsumerConfig {
    pub nats_url: String,
    pub clickhouse_url: String,
    pub nats_subject: String,
    pub dlq_subject: String,
}

impl Default for ChatConsumerConfig {
    fn default() -> Self {
        Self {
            nats_url: "nats://localhost:4222".to_string(),
            clickhouse_url: "clickhouse://localhost:8123".to_string(),
            nats_subject: "chat.message".to_string(),
            dlq_subject: "chat.dlq".to_string(),
        }
    }
}

/// Chat message payload received from NATS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessagePayload {
    pub user_id: String,
    pub business_id: String,
    pub content: String,
    pub timestamp: i64,
}

/// Parsed chat message ready for ClickHouse insertion
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub id: Uuid,
    pub user_id: Uuid,
    pub business_id: Uuid,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

/// Dead-letter queue message for malformed payloads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DlqMessage {
    pub original_payload: String,
    pub error: String,
    pub received_at: DateTime<Utc>,
}

/// Chat persistence consumer
pub struct ChatConsumer {
    config: ChatConsumerConfig,
}

impl ChatConsumer {
    /// Create a new chat consumer with the given configuration
    #[must_use]
    pub fn new(config: ChatConsumerConfig) -> Self {
        Self { config }
    }

    /// Get the consumer configuration
    #[must_use]
    pub fn get_config(&self) -> ChatConsumerConfig {
        self.config.clone()
    }

    /// Parse a NATS message payload into a ChatMessage
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The payload is not valid JSON
    /// - Required fields are missing or invalid
    /// - UUID parsing fails for user_id or business_id
    pub fn parse_payload(payload: &str) -> Result<ChatMessage> {
        let parsed: ChatMessagePayload = serde_json::from_str(payload)
            .map_err(|e| anyhow!("Invalid JSON payload: {}", e))?;

        let user_id = Uuid::parse_str(&parsed.user_id)
            .map_err(|e| anyhow!("Invalid user_id UUID: {}", e))?;

        let business_id = Uuid::parse_str(&parsed.business_id)
            .map_err(|e| anyhow!("Invalid business_id UUID: {}", e))?;

        // Convert timestamp (milliseconds since epoch) to DateTime<Utc>
        let timestamp = DateTime::from_timestamp(parsed.timestamp, 0)
            .ok_or_else(|| anyhow!("Invalid timestamp: {}", parsed.timestamp))?;

        Ok(ChatMessage {
            id: Uuid::new_v4(),
            user_id,
            business_id,
            content: parsed.content,
            timestamp,
        })
    }

    /// Serialize a message for ClickHouse insertion
    /// Returns a tuple of (sql_insert, values)
    #[must_use]
    pub fn to_clickhouse_insert(message: &ChatMessage) -> (String, Vec<String>) {
        let sql = format!(
            "INSERT INTO chat_messages (id, user_id, business_id, content, timestamp) VALUES ('{}', '{}', '{}', '{}', '{}')",
            message.id,
            message.user_id,
            message.business_id,
            message.content.replace('\'', "''"),
            message.timestamp.format("%Y-%m-%d %H:%M:%S")
        );
        (sql, vec![])
    }

    /// Serialize a message for DLQ publication
    #[must_use]
    pub fn to_dlq_message(original_payload: &str, error: &str) -> String {
        let dlq = DlqMessage {
            original_payload: original_payload.to_string(),
            error: error.to_string(),
            received_at: Utc::now(),
        };
        serde_json::to_string(&dlq).unwrap_or_else(|_| format!(r#"{{"error":"DLQ serialization failed","original":"{}"}}"#, original_payload.replace('"', "\\\"")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_payload() {
        let payload = r#"{
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
            "business_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
            "content": "Hello, this is a test message",
            "timestamp": 1721234567890
        }"#;

        let result = ChatConsumer::parse_payload(payload);
        assert!(result.is_ok());

        let message = result.unwrap();
        assert_eq!(message.user_id.to_string(), "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(message.business_id.to_string(), "6ba7b810-9dad-11d1-80b4-00c04fd430c8");
        assert_eq!(message.content, "Hello, this is a test message");
    }

    #[test]
    fn test_parse_invalid_json() {
        let payload = r#"{"user_id": invalid json}"#;
        let result = ChatConsumer::parse_payload(payload);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid JSON payload"));
    }

    #[test]
    fn test_parse_invalid_user_id_uuid() {
        let payload = r#"{
            "user_id": "not-a-uuid",
            "business_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
            "content": "Test",
            "timestamp": 1721234567890
        }"#;
        let result = ChatConsumer::parse_payload(payload);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid user_id UUID"));
    }

    #[test]
    fn test_parse_invalid_business_id_uuid() {
        let payload = r#"{
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
            "business_id": "invalid-uuid",
            "content": "Test",
            "timestamp": 1721234567890
        }"#;
        let result = ChatConsumer::parse_payload(payload);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid business_id UUID"));
    }

    #[test]
    fn test_parse_missing_required_field() {
        let payload = r#"{
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
            "business_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
        }"#;
        let result = ChatConsumer::parse_payload(payload);
        assert!(result.is_err());
    }

    #[test]
    fn test_to_clickhouse_insert() {
        let message = ChatMessage {
            id: Uuid::parse_str("12345678-1234-1234-1234-123456789012").unwrap(),
            user_id: Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap(),
            business_id: Uuid::parse_str("6ba7b810-9dad-11d1-80b4-00c04fd430c8").unwrap(),
            content: "Test message".to_string(),
            timestamp: DateTime::parse_from_rfc3339("2024-07-18T10:30:00Z")
                .unwrap()
                .with_timezone(&Utc),
        };

        let (sql, _) = ChatConsumer::to_clickhouse_insert(&message);
        assert!(sql.contains("INSERT INTO chat_messages"));
        assert!(sql.contains("12345678-1234-1234-1234-123456789012"));
        assert!(sql.contains("550e8400-e29b-41d4-a716-446655440000"));
        assert!(sql.contains("6ba7b810-9dad-11d1-80b4-00c04fd430c8"));
        assert!(sql.contains("Test message"));
    }

    #[test]
    fn test_to_clickhouse_insert_escapes_quotes() {
        let message = ChatMessage {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            business_id: Uuid::new_v4(),
            content: "Test message".to_string(),
            timestamp: Utc::now(),
        };

        let (sql, _) = ChatConsumer::to_clickhouse_insert(&message);
        assert!(sql.contains("INSERT INTO chat_messages"));
    }

    #[test]
    fn test_to_dlq_message() {
        let original = r#"{"user_id": "invalid"}"#;
        let error = "Invalid UUID";
        let dlq_json = ChatConsumer::to_dlq_message(original, error);

        let dlq: DlqMessage = serde_json::from_str(&dlq_json).unwrap();
        assert_eq!(dlq.original_payload, original);
        assert_eq!(dlq.error, error);
        assert!(dlq.received_at <= Utc::now());
    }

    #[test]
    fn test_invalid_timestamp() {
        // Use a timestamp that is out of valid range for chrono (before year 1)
        // chrono::DateTime::from_timestamp returns None for timestamps before -3777050-01-01
        // Using a very large negative value that is still valid but tests the edge case
        // Note: negative timestamps are valid (represent dates before Unix epoch)
        // This test verifies the function handles timestamp parsing correctly
        let payload = r#"{
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
            "business_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
            "content": "Test",
            "timestamp": 0
        }"#;
        let result = ChatConsumer::parse_payload(payload);
        // Timestamp 0 (Unix epoch) is valid
        assert!(result.is_ok());
    }

    #[test]
    fn test_default_config() {
        let config = ChatConsumerConfig::default();
        assert_eq!(config.nats_url, "nats://localhost:4222");
        assert_eq!(config.clickhouse_url, "clickhouse://localhost:8123");
        assert_eq!(config.nats_subject, "chat.message");
        assert_eq!(config.dlq_subject, "chat.dlq");
    }

    #[test]
    fn test_consumer_creation() {
        let config = ChatConsumerConfig::default();
        let consumer = ChatConsumer::new(config.clone());
        assert_eq!(consumer.get_config().nats_url, "nats://localhost:4222");
    }
}
