//! NATS publisher for email notifications.
//!
//! This module provides functionality to publish email messages to the NATS `email.send` subject.

use crate::email_service::{EmailMessage, NatsEmailPayload};
use anyhow::{anyhow, Result};
use serde::Serialize;

/// NATS subject for email sending
pub const EMAIL_SEND_SUBJECT: &str = "email.send";

/// Email publisher for sending email notifications via NATS
pub struct EmailPublisher {
    nats_client: async_nats::Client,
}

impl EmailPublisher {
    /// Create a new email publisher
    ///
    /// # Arguments
    /// * `nats_client` - Connected NATS client
    ///
    /// # Returns
    /// A new EmailPublisher instance
    #[must_use]
    pub fn new(nats_client: async_nats::Client) -> Self {
        Self { nats_client }
    }

    /// Publish an email message to NATS
    ///
    /// Serializes the email payload and publishes it to the `email.send` subject.
    ///
    /// # Arguments
    /// * `payload` - The email payload to publish
    ///
    /// # Errors
    /// Returns an error if:
    /// - Serialization fails
    /// - NATS publish fails
    ///
    /// # Returns
    /// * `Ok(())` if the message was published successfully
    pub async fn publish(&self, payload: &NatsEmailPayload) -> Result<()> {
        let payload_bytes = serde_json::to_vec(payload)
            .map_err(|e| anyhow!("Failed to serialize email payload: {}", e))?;

        self.nats_client
            .publish(EMAIL_SEND_SUBJECT.to_string(), payload_bytes.into())
            .await
            .map_err(|e| anyhow!("Failed to publish to NATS: {}", e))?;

        Ok(())
    }

    /// Publish an email message from an EmailMessage struct
    ///
    /// # Arguments
    /// * `email` - The email message to publish
    ///
    /// # Errors
    /// Returns an error if serialization or publish fails
    pub async fn publish_email(&self, email: &EmailMessage) -> Result<()> {
        let payload = NatsEmailPayload {
            to: email.to.clone(),
            subject: email.subject.clone(),
            body: email.body.clone(),
            template_name: email.template_name.clone(),
            template_vars: email.template_vars.clone(),
        };

        self.publish(&payload).await
    }

    /// Publish to a custom subject
    ///
    /// # Arguments
    /// * `subject` - The NATS subject to publish to
    /// * `payload` - The payload to publish
    ///
    /// # Errors
    /// Returns an error if serialization or publish fails
    pub async fn publish_to_subject<T: Serialize>(
        &self,
        subject: &str,
        payload: &T,
    ) -> Result<()> {
        let payload_bytes = serde_json::to_vec(payload)
            .map_err(|e| anyhow!("Failed to serialize payload: {}", e))?;

        self.nats_client
            .publish(subject.to_string(), payload_bytes.into())
            .await
            .map_err(|e| anyhow!("Failed to publish to NATS: {}", e))?;

        Ok(())
    }
}

/// Configuration for the email publisher
#[derive(Debug, Clone)]
pub struct EmailPublisherConfig {
    /// NATS server URL
    pub nats_url: String,
}

impl Default for EmailPublisherConfig {
    fn default() -> Self {
        Self {
            nats_url: "nats://localhost:4222".to_string(),
        }
    }
}

impl EmailPublisherConfig {
    /// Create a new config with a custom NATS URL
    ///
    /// # Arguments
    /// * `nats_url` - The NATS server URL
    ///
    /// # Returns
    /// A new EmailPublisherConfig instance
    #[must_use]
    pub fn with_nats_url(nats_url: &str) -> Self {
        Self {
            nats_url: nats_url.to_string(),
        }
    }

    /// Connect to NATS and create a publisher
    ///
    /// # Errors
    /// Returns an error if NATS connection fails
    pub async fn connect(&self) -> Result<EmailPublisher> {
        let nats_client = async_nats::connect(&self.nats_url)
            .await
            .map_err(|e| anyhow!("Failed to connect to NATS: {}", e))?;

        Ok(EmailPublisher::new(nats_client))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_subject_constant() {
        assert_eq!(EMAIL_SEND_SUBJECT, "email.send");
    }

    #[test]
    fn test_default_config() {
        let config = EmailPublisherConfig::default();
        assert_eq!(config.nats_url, "nats://localhost:4222");
    }

    #[test]
    fn test_config_with_url() {
        let config = EmailPublisherConfig::with_nats_url("nats://custom:4222");
        assert_eq!(config.nats_url, "nats://custom:4222");
    }

    #[test]
    fn test_payload_serialization() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "John".to_string());

        let payload = NatsEmailPayload {
            to: "john@example.com".to_string(),
            subject: "Test Subject".to_string(),
            body: "Test body".to_string(),
            template_name: Some("notification".to_string()),
            template_vars: vars,
        };

        let json = serde_json::to_string(&payload).unwrap();
        let deserialized: NatsEmailPayload = serde_json::from_str(&json).unwrap();

        assert_eq!(payload.to, deserialized.to);
        assert_eq!(payload.subject, deserialized.subject);
        assert_eq!(payload.template_name, deserialized.template_name);
    }

    #[test]
    fn test_payload_serialization_no_template() {
        let payload = NatsEmailPayload {
            to: "test@example.com".to_string(),
            subject: "Test".to_string(),
            body: "Body".to_string(),
            template_name: None,
            template_vars: HashMap::new(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        let deserialized: NatsEmailPayload = serde_json::from_str(&json).unwrap();

        assert!(deserialized.template_name.is_none());
        assert!(deserialized.template_vars.is_empty());
    }
}
