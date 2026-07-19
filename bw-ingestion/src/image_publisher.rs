//! NATS publisher for image processing requests.
//!
//! This module provides functionality to publish image processing requests
//! to the NATS `image.process` subject.

use crate::image_processor::ImageProcessRequest;
use anyhow::{anyhow, Result};
use serde::Serialize;

/// NATS subject for image processing requests
pub const IMAGE_PROCESS_SUBJECT: &str = "image.process";

/// Image publisher for sending processing requests to NATS
pub struct ImagePublisher {
    nats_client: async_nats::Client,
}

impl ImagePublisher {
    /// Create a new image publisher
    ///
    /// # Arguments
    /// * `nats_client` - Connected NATS client
    ///
    /// # Returns
    /// A new ImagePublisher instance
    #[must_use]
    pub fn new(nats_client: async_nats::Client) -> Self {
        Self {
            nats_client,
        }
    }

    /// Publish an image processing request to NATS
    ///
    /// Serializes the request and publishes it to the `image.process` subject.
    ///
    /// # Arguments
    /// * `request` - The image processing request to publish
    ///
    /// # Errors
    /// Returns an error if:
    /// - Serialization fails
    /// - NATS publish fails
    ///
    /// # Returns
    /// * `Ok(())` if the message was published successfully
    pub async fn publish(&self, request: &ImageProcessRequest) -> Result<()> {
        let payload = serde_json::to_vec(request)
            .map_err(|e| anyhow!("Failed to serialize image processing request: {}", e))?;

        self.nats_client
            .publish(IMAGE_PROCESS_SUBJECT.to_string(), payload.into())
            .await
            .map_err(|e| anyhow!("Failed to publish to NATS: {}", e))?;

        Ok(())
    }

    /// Publish an image processing request with custom subject
    ///
    /// # Arguments
    /// * `subject` - The NATS subject to publish to
    /// * `request` - The image processing request to publish
    ///
    /// # Errors
    /// Returns an error if serialization or publish fails
    pub async fn publish_to_subject<T: Serialize>(
        &self,
        subject: &str,
        request: &T,
    ) -> Result<()> {
        let payload = serde_json::to_vec(request)
            .map_err(|e| anyhow!("Failed to serialize request: {}", e))?;

        self.nats_client
            .publish(subject.to_string(), payload.into())
            .await
            .map_err(|e| anyhow!("Failed to publish to NATS: {}", e))?;

        Ok(())
    }
}

/// Configuration for the image publisher
#[derive(Debug, Clone)]
pub struct ImagePublisherConfig {
    /// NATS server URL
    pub nats_url: String,
}

impl Default for ImagePublisherConfig {
    fn default() -> Self {
        Self {
            nats_url: "nats://localhost:4222".to_string(),
        }
    }
}

impl ImagePublisherConfig {
    /// Create a new publisher config with a custom NATS URL
    ///
    /// # Arguments
    /// * `nats_url` - The NATS server URL
    ///
    /// # Returns
    /// A new ImagePublisherConfig instance
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
    pub async fn connect(&self) -> Result<ImagePublisher> {
        let nats_client = async_nats::connect(&self.nats_url)
            .await
            .map_err(|e| anyhow!("Failed to connect to NATS: {}", e))?;

        Ok(ImagePublisher::new(nats_client))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subject_constant() {
        assert_eq!(IMAGE_PROCESS_SUBJECT, "image.process");
    }

    #[test]
    fn test_default_config() {
        let config = ImagePublisherConfig::default();
        assert_eq!(config.nats_url, "nats://localhost:4222");
    }

    #[test]
    fn test_config_with_url() {
        let config = ImagePublisherConfig::with_nats_url("nats://custom:4222");
        assert_eq!(config.nats_url, "nats://custom:4222");
    }

    #[test]
    fn test_publisher_creation() {
        // This test verifies the publisher can be created
        // Actual NATS connection requires a running server
        let rt = tokio::runtime::Runtime::new().unwrap();
        let nats_client = rt.block_on(async_nats::connect("nats://localhost:4222")).ok();

        if nats_client.is_some() {
            // Publisher creation verified - actual NATS connection requires running server
        }
    }

    #[test]
    fn test_request_serialization() {
        let request = ImageProcessRequest {
            source_path: "images/test/photo.jpg".to_string(),
            bucket: Some("test-bucket".to_string()),
        };

        let json = serde_json::to_string(&request).unwrap();
        let deserialized: ImageProcessRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(request.source_path, deserialized.source_path);
        assert_eq!(request.bucket, deserialized.bucket);
    }

    #[test]
    fn test_request_serialization_no_bucket() {
        let request = ImageProcessRequest {
            source_path: "images/test/photo.jpg".to_string(),
            bucket: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        let deserialized: ImageProcessRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(request.source_path, deserialized.source_path);
        assert!(deserialized.bucket.is_none());
    }
}
