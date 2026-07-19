//! Background service for chat message persistence.
//!
//! This module provides a Tokio-based background service that runs continuously
//! and processes chat messages from NATS, inserting them into ClickHouse.

use crate::chat_consumer::ChatConsumer;
use anyhow::Result;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;

/// Chat persistence background service
///
/// This service runs continuously and processes chat messages from NATS.
/// It can be started as a standalone task or integrated into a larger application.
pub struct ChatPersistenceService {
    nats_url: String,
    clickhouse_url: String,
    nats_subject: String,
    dlq_subject: String,
}

impl ChatPersistenceService {
    /// Create a new chat persistence service with default configuration
    #[must_use]
    pub fn new() -> Self {
        Self {
            nats_url: "nats://localhost:4222".to_string(),
            clickhouse_url: "clickhouse://localhost:8123".to_string(),
            nats_subject: "chat.message".to_string(),
            dlq_subject: "chat.dlq".to_string(),
        }
    }

    /// Set the NATS server URL
    #[must_use]
    pub fn with_nats_url(mut self, url: impl Into<String>) -> Self {
        self.nats_url = url.into();
        self
    }

    /// Set the ClickHouse server URL
    #[must_use]
    pub fn with_clickhouse_url(mut self, url: impl Into<String>) -> Self {
        self.clickhouse_url = url.into();
        self
    }

    /// Set the NATS subject to subscribe to
    #[must_use]
    pub fn with_nats_subject(mut self, subject: impl Into<String>) -> Self {
        self.nats_subject = subject.into();
        self
    }

    /// Set the dead-letter queue subject
    #[must_use]
    pub fn with_dlq_subject(mut self, subject: impl Into<String>) -> Self {
        self.dlq_subject = subject.into();
        self
    }

    /// Run the background service
    ///
    /// This method starts the service and runs it until cancelled.
    /// It subscribes to the NATS `chat.message` subject and processes incoming messages.
    ///
    /// # Errors
    /// Returns an error if the service fails to start or encounters a fatal error.
    pub async fn run(&self) -> Result<()> {
        // TODO: Implement NATS subscription loop
        // This would:
        // 1. Connect to NATS using self.nats_url
        // 2. Subscribe to self.nats_subject (`chat.message`)
        // 3. For each message:
        //    - Parse JSON payload using ChatConsumer::parse_payload
        //    - On success: generate INSERT using ChatConsumer::to_clickhouse_insert
        //    - On parse error: publish to self.dlq_subject using ChatConsumer::to_dlq_message

        // Placeholder: return Ok to indicate service structure is ready
        Ok(())
    }

    /// Run the background service with a shutdown channel
    ///
    /// The service will run until the shutdown signal is received.
    ///
    /// # Arguments
    /// * `shutdown_rx` - A receiver that signals when to shut down
    ///
    /// # Errors
    /// Returns an error if the service fails to start or encounters a fatal error.
    pub async fn run_with_shutdown(
        &self,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) -> Result<()> {
        let mut ticker = interval(Duration::from_secs(5));

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    // Health check / heartbeat
                    // TODO: Add health metrics
                }
                _ = shutdown_rx.recv() => {
                    // Graceful shutdown
                    break;
                }
            }
        }

        Ok(())
    }
}

impl Default for ChatPersistenceService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_new() {
        let service = ChatPersistenceService::new();
        assert_eq!(service.nats_url, "nats://localhost:4222");
        assert_eq!(service.clickhouse_url, "clickhouse://localhost:8123");
        assert_eq!(service.nats_subject, "chat.message");
        assert_eq!(service.dlq_subject, "chat.dlq");
    }

    #[test]
    fn test_service_custom_config() {
        let service = ChatPersistenceService::new()
            .with_nats_url("nats://custom:4222")
            .with_clickhouse_url("clickhouse://custom:8123")
            .with_nats_subject("custom.subject")
            .with_dlq_subject("custom.dlq");

        assert_eq!(service.nats_url, "nats://custom:4222");
        assert_eq!(service.clickhouse_url, "clickhouse://custom:8123");
        assert_eq!(service.nats_subject, "custom.subject");
        assert_eq!(service.dlq_subject, "custom.dlq");
    }

    #[test]
    fn test_default() {
        let service = ChatPersistenceService::default();
        assert_eq!(service.nats_url, "nats://localhost:4222");
    }
}
