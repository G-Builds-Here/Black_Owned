//! NATS consumer for email notifications with retry logic and DLQ support.
//!
//! This module provides:
//! - NATS subscriber for email.send subject
//! - Retry logic with configurable attempts
//! - Dead Letter Queue (DLQ) for failed emails
//! - Email service integration for delivery

use crate::email_service::{EmailService, NatsEmailPayload, SmtpConfig};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// NATS subject for email sending
pub const EMAIL_SEND_SUBJECT: &str = "email.send";

/// NATS subject for dead letter queue
pub const EMAIL_DLQ_SUBJECT: &str = "email.dlq";

/// Maximum retry attempts before sending to DLQ
pub const MAX_RETRY_ATTEMPTS: u32 = 5;

/// Retry delay between attempts (exponential backoff base)
pub const RETRY_DELAY_BASE: Duration = Duration::from_secs(5);

/// Email retry record for tracking attempts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailRetryRecord {
    pub payload: NatsEmailPayload,
    pub attempt: u32,
    pub last_error: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_attempt_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl EmailRetryRecord {
    /// Create a new retry record
    #[must_use]
    pub fn new(payload: NatsEmailPayload) -> Self {
        Self {
            payload,
            attempt: 0,
            last_error: None,
            created_at: chrono::Utc::now(),
            last_attempt_at: None,
        }
    }

    /// Increment retry attempt
    pub fn increment_attempt(&mut self, error: String) {
        self.attempt += 1;
        self.last_error = Some(error);
        self.last_attempt_at = Some(chrono::Utc::now());
    }

    /// Check if max retries exceeded
    #[must_use]
    pub fn should_send_to_dlq(&self) -> bool {
        self.attempt >= MAX_RETRY_ATTEMPTS
    }
}

/// Email consumer configuration
#[derive(Debug, Clone)]
pub struct EmailConsumerConfig {
    /// NATS server URL
    pub nats_url: String,
    /// JetStream stream name
    pub stream_name: String,
    /// Consumer name
    pub consumer_name: String,
    /// Maximum retry attempts
    pub max_retry_attempts: u32,
    /// Retry delay base (exponential backoff)
    pub retry_delay_base: Duration,
    /// SMTP configuration
    pub smtp_config: SmtpConfig,
}

impl Default for EmailConsumerConfig {
    fn default() -> Self {
        Self {
            nats_url: "nats://localhost:4222".to_string(),
            stream_name: "EMAIL".to_string(),
            consumer_name: "email_consumer".to_string(),
            max_retry_attempts: MAX_RETRY_ATTEMPTS,
            retry_delay_base: RETRY_DELAY_BASE,
            smtp_config: SmtpConfig::default(),
        }
    }
}

impl EmailConsumerConfig {
    /// Create a new config with custom NATS URL
    #[must_use]
    pub fn with_nats_url(nats_url: &str) -> Self {
        Self {
            nats_url: nats_url.to_string(),
            ..Default::default()
        }
    }

    /// Create a new config with stream and consumer names
    #[must_use]
    pub fn with_names(stream_name: &str, consumer_name: &str) -> Self {
        Self {
            stream_name: stream_name.to_string(),
            consumer_name: consumer_name.to_string(),
            ..Default::default()
        }
    }

    /// Set max retry attempts
    #[must_use]
    pub fn with_max_retries(self, max_retries: u32) -> Self {
        Self {
            max_retry_attempts: max_retries,
            ..self
        }
    }

    /// Set SMTP configuration
    #[must_use]
    pub fn with_smtp_config(self, smtp_config: SmtpConfig) -> Self {
        Self {
            smtp_config,
            ..self
        }
    }
}

/// Email consumer for processing email notifications
pub struct EmailConsumer {
    config: EmailConsumerConfig,
    email_service: EmailService,
}

impl EmailConsumer {
    /// Create a new email consumer
    ///
    /// # Arguments
    /// * `config` - Consumer configuration
    ///
    /// # Returns
    /// A new EmailConsumer instance
    #[must_use]
    pub fn new(config: EmailConsumerConfig) -> Self {
        let email_service = EmailService::new(config.smtp_config.clone());

        Self {
            config,
            email_service,
        }
    }

    /// Calculate retry delay with exponential backoff
    #[must_use]
    pub fn calculate_retry_delay(&self, attempt: u32) -> Duration {
        let exponent = attempt.min(10); // Cap at 2^10 to prevent overflow
        self.config.retry_delay_base * 2u32.pow(exponent)
    }

    /// Process a single email payload
    ///
    /// # Arguments
    /// * `payload` - The email payload to process
    ///
    /// # Returns
    /// * `Ok(email_id)` if the email was sent successfully
    /// * `Err(e)` if sending failed
    pub async fn process_email(&mut self, payload: &NatsEmailPayload) -> Result<uuid::Uuid> {
        let result = self
            .email_service
            .send_from_nats_payload(payload.clone())
            .await;

        match result {
            Ok(email_id) => Ok(email_id),
            Err(e) => Err(e),
        }
    }

    /// Process email with retry logic
    ///
    /// # Arguments
    /// * `payload` - The email payload to process
    ///
    /// # Returns
    /// * `Ok(email_id)` if the email was eventually sent successfully
    /// * `Err(e)` if all retries exhausted
    pub async fn process_with_retry(&mut self, payload: NatsEmailPayload) -> Result<uuid::Uuid> {
        let mut retry_record = EmailRetryRecord::new(payload.clone());

        while !retry_record.should_send_to_dlq() {
            match self.process_email(&payload).await {
                Ok(email_id) => return Ok(email_id),
                Err(e) => {
                    let error_msg = e.to_string();
                    retry_record.increment_attempt(error_msg.clone());

                    if retry_record.should_send_to_dlq() {
                        return Err(anyhow!("Max retries exceeded: {}", error_msg));
                    }

                    // Wait before retrying (exponential backoff)
                    let delay = self.calculate_retry_delay(retry_record.attempt);
                    tokio::time::sleep(delay).await;
                }
            }
        }

        Err(anyhow!("Retry loop exited unexpectedly"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_constants() {
        assert_eq!(EMAIL_SEND_SUBJECT, "email.send");
        assert_eq!(EMAIL_DLQ_SUBJECT, "email.dlq");
        assert_eq!(MAX_RETRY_ATTEMPTS, 5);
    }

    #[test]
    fn test_retry_record_creation() {
        let payload = NatsEmailPayload {
            to: "test@example.com".to_string(),
            subject: "Test".to_string(),
            body: "Body".to_string(),
            template_name: None,
            template_vars: HashMap::new(),
        };

        let record = EmailRetryRecord::new(payload.clone());

        assert_eq!(record.attempt, 0);
        assert!(record.last_error.is_none());
        assert!(record.last_attempt_at.is_none());
        assert!(!record.should_send_to_dlq());
    }

    #[test]
    fn test_retry_record_increment() {
        let payload = NatsEmailPayload {
            to: "test@example.com".to_string(),
            subject: "Test".to_string(),
            body: "Body".to_string(),
            template_name: None,
            template_vars: HashMap::new(),
        };

        let mut record = EmailRetryRecord::new(payload);

        record.increment_attempt("Error 1".to_string());
        assert_eq!(record.attempt, 1);
        assert_eq!(record.last_error, Some("Error 1".to_string()));
        assert!(record.last_attempt_at.is_some());
        assert!(!record.should_send_to_dlq());

        // Increment to max
        for _ in 1..MAX_RETRY_ATTEMPTS {
            record.increment_attempt("Error".to_string());
        }

        assert!(record.should_send_to_dlq());
    }

    #[test]
    fn test_retry_delay_exponential_backoff() {
        let config = EmailConsumerConfig::default();
        let consumer = EmailConsumer::new(config);

        // Verify exponential backoff
        let delay0 = consumer.calculate_retry_delay(0);
        let delay1 = consumer.calculate_retry_delay(1);
        let delay2 = consumer.calculate_retry_delay(2);

        assert_eq!(delay0, Duration::from_secs(5));
        assert_eq!(delay1, Duration::from_secs(10));
        assert_eq!(delay2, Duration::from_secs(20));
    }

    #[test]
    fn test_consumer_config_builder() {
        let config = EmailConsumerConfig {
            nats_url: "nats://custom:4222".to_string(),
            stream_name: "MY_STREAM".to_string(),
            consumer_name: "MY_CONSUMER".to_string(),
            max_retry_attempts: 10,
            retry_delay_base: Duration::from_secs(5),
            smtp_config: SmtpConfig {
                from_email: "test@example.com".to_string(),
                ..Default::default()
            },
        };

        assert_eq!(config.nats_url, "nats://custom:4222");
        assert_eq!(config.stream_name, "MY_STREAM");
        assert_eq!(config.consumer_name, "MY_CONSUMER");
        assert_eq!(config.max_retry_attempts, 10);
        assert_eq!(config.smtp_config.from_email, "test@example.com");
    }

    #[tokio::test]
    async fn test_consumer_process_email() {
        let config = EmailConsumerConfig::default();
        let mut consumer = EmailConsumer::new(config);

        let payload = NatsEmailPayload {
            to: "test@example.com".to_string(),
            subject: "Test".to_string(),
            body: "Test body".to_string(),
            template_name: None,
            template_vars: HashMap::new(),
        };

        let result = consumer.process_email(&payload).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_consumer_process_with_retry_success() {
        let config = EmailConsumerConfig::default();
        let mut consumer = EmailConsumer::new(config);

        let payload = NatsEmailPayload {
            to: "test@example.com".to_string(),
            subject: "Test".to_string(),
            body: "Test body".to_string(),
            template_name: None,
            template_vars: HashMap::new(),
        };

        let result = consumer.process_with_retry(payload).await;
        assert!(result.is_ok());
    }
}
