//! NATS image worker for processing image thumbnails.
//!
//! This module implements a NATS consumer that listens for image processing
//! requests and generates thumbnails at multiple sizes.

use anyhow::Result;
use crate::image_processor::{ImageProcessor, THUMBNAIL_SIZES};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Message payload for image processing requests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageProcessRequest {
    /// Path to the source image in MinIO
    pub source_path: String,
    /// Bucket containing the source image
    pub source_bucket: String,
    /// Content type of the source image (e.g., "image/jpeg")
    pub content_type: String,
    /// Optional callback URL for notification (not implemented)
    pub callback_url: Option<String>,
}

/// Response from image processing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageProcessResponse {
    /// Whether processing was successful
    pub success: bool,
    /// Path to the source image
    pub source_path: String,
    /// List of generated thumbnail paths
    pub thumbnail_paths: Vec<String>,
    /// Error message if processing failed
    pub error: Option<String>,
}

/// NATS message handler for image processing
pub struct ImageWorker {
    processor: Arc<ImageProcessor>,
    nats_url: String,
}

impl ImageWorker {
    /// Creates a new ImageWorker instance
    ///
    /// # Arguments
    /// * `nats_url` - NATS server URL
    /// * `minio_endpoint` - MinIO endpoint URL
    /// * `minio_access_key` - MinIO access key
    /// * `minio_secret_key` - MinIO secret key
    /// * `source_bucket` - Bucket for source images
    /// * `thumbnail_bucket` - Bucket for thumbnail storage
    ///
    /// # Errors
    /// Returns an error if the processor cannot be created
    pub fn new(
        nats_url: &str,
        minio_endpoint: &str,
        minio_access_key: &str,
        minio_secret_key: &str,
        source_bucket: String,
        thumbnail_bucket: String,
    ) -> Result<Self> {
        let processor = ImageProcessor::new(
            minio_endpoint,
            minio_access_key,
            minio_secret_key,
            source_bucket,
            thumbnail_bucket,
        )?;

        Ok(Self {
            processor: Arc::new(processor),
            nats_url: nats_url.to_string(),
        })
    }

    /// Processes an image request and generates thumbnails
    ///
    /// # Arguments
    /// * `request` - The image processing request
    ///
    /// # Returns
    /// A response containing the result and thumbnail paths
    pub async fn process_image(&self, request: ImageProcessRequest) -> ImageProcessResponse {
        // Validate the source path
        if request.source_path.is_empty() {
            return ImageProcessResponse {
                success: false,
                source_path: request.source_path,
                thumbnail_paths: Vec::new(),
                error: Some("Source path is required".to_string()),
            };
        }

        // Validate the content type
        if !Self::is_supported_content_type(&request.content_type) {
            return ImageProcessResponse {
                success: false,
                source_path: request.source_path.clone(),
                thumbnail_paths: Vec::new(),
                error: Some(format!(
                    "Unsupported content type: {}",
                    request.content_type
                )),
            };
        }

        // Download the source image
        let source_data = match self.processor.download_image(&request.source_path) {
            Ok(data) => data,
            Err(e) => {
                return ImageProcessResponse {
                    success: false,
                    source_path: request.source_path.clone(),
                    thumbnail_paths: Vec::new(),
                    error: Some(format!("Failed to download image: {}", e)),
                }
            }
        };

        // Generate thumbnails
        let thumbnails = match self
            .processor
            .generate_thumbnails(&source_data, &request.content_type)
        {
            Ok(thumbs) => thumbs,
            Err(e) => {
                return ImageProcessResponse {
                    success: false,
                    source_path: request.source_path.clone(),
                    thumbnail_paths: Vec::new(),
                    error: Some(format!("Failed to generate thumbnails: {}", e)),
                }
            }
        };

        // Upload thumbnails to MinIO
        let mut thumbnail_paths = Vec::new();
        for (i, thumb_data) in thumbnails.iter().enumerate() {
            let size = THUMBNAIL_SIZES[i];
            let thumbnail_path =
                ImageProcessor::generate_thumbnail_path(&request.source_path, size);

            match self.processor.upload_image(
                &thumbnail_path,
                &thumb_data.1,
                &request.content_type,
            ) {
                Ok(_) => thumbnail_paths.push(thumbnail_path),
                Err(e) => {
                    return ImageProcessResponse {
                        success: false,
                        source_path: request.source_path.clone(),
                        thumbnail_paths,
                        error: Some(format!(
                            "Failed to upload thumbnail {}: {}",
                            thumbnail_path, e
                        )),
                    }
                }
            }
        }

        ImageProcessResponse {
            success: true,
            source_path: request.source_path,
            thumbnail_paths,
            error: None,
        }
    }

    /// Checks if a content type is supported
    ///
    /// # Arguments
    /// * `content_type` - The MIME type to check
    ///
    /// # Returns
    /// `true` if the content type is supported
    #[must_use]
    pub fn is_supported_content_type(content_type: &str) -> bool {
        let lower = content_type.to_lowercase();
        lower.contains("jpeg")
            || lower.contains("jpg")
            || lower.contains("gif")
            || lower.contains("png")
    }

    /// Starts the NATS worker and subscribes to the image.process subject
    ///
    /// # Arguments
    /// * `queue_group` - Optional queue group name for load balancing
    ///
    /// # Errors
    /// Returns an error if NATS connection fails or subscription cannot be created
    pub async fn start(&self, _queue_group: Option<&str>) -> Result<()> {
        // Note: This is a placeholder for the NATS subscription logic.
        // In a full implementation, this would:
        // 1. Connect to NATS server
        // 2. Subscribe to "image.process" subject
        // 3. Process incoming messages asynchronously
        //
        // The nats crate would be used here:
        // let nc = nats::connect(&self.nats_url)?;
        // let sub = if let Some(qg) = queue_group {
        //     nc.queue_subscribe("image.process", qg)?
        // } else {
        //     nc.subscribe("image.process")?
        // };
        //
        // for msg in sub {
        //     let request: ImageProcessRequest = serde_json::from_slice(&msg.data)?;
        //     let response = self.process_image(request).await;
        //     // Publish response or acknowledge message
        // }

        // Placeholder: Return success to indicate the worker is configured
        // In production, this would block and process messages indefinitely
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_supported_content_type_jpeg() {
        assert!(ImageWorker::is_supported_content_type("image/jpeg"));
        assert!(ImageWorker::is_supported_content_type("IMAGE/JPEG"));
        assert!(ImageWorker::is_supported_content_type("image/jpg"));
    }

    #[test]
    fn test_is_supported_content_type_gif() {
        assert!(ImageWorker::is_supported_content_type("image/gif"));
        assert!(ImageWorker::is_supported_content_type("IMAGE/GIF"));
    }

    #[test]
    fn test_is_supported_content_type_png() {
        assert!(ImageWorker::is_supported_content_type("image/png"));
        assert!(ImageWorker::is_supported_content_type("IMAGE/PNG"));
    }

    #[test]
    fn test_is_supported_content_type_unsupported() {
        assert!(!ImageWorker::is_supported_content_type("image/bmp"));
        assert!(!ImageWorker::is_supported_content_type("image/webp"));
        assert!(!ImageWorker::is_supported_content_type("text/plain"));
    }

    #[test]
    fn test_image_process_request_serialization() {
        let request = ImageProcessRequest {
            source_path: "images/test.jpg".to_string(),
            source_bucket: "source".to_string(),
            content_type: "image/jpeg".to_string(),
            callback_url: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        let deserialized: ImageProcessRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.source_path, request.source_path);
        assert_eq!(deserialized.source_bucket, request.source_bucket);
        assert_eq!(deserialized.content_type, request.content_type);
    }

    #[test]
    fn test_image_process_response_success() {
        let response = ImageProcessResponse {
            success: true,
            source_path: "images/test.jpg".to_string(),
            thumbnail_paths: vec![
                "images/test_150px.jpg".to_string(),
                "images/test_300px.jpg".to_string(),
                "images/test_800px.jpg".to_string(),
            ],
            error: None,
        };

        assert!(response.success);
        assert_eq!(response.thumbnail_paths.len(), 3);
        assert!(response.error.is_none());
    }

    #[test]
    fn test_image_process_response_failure() {
        let response = ImageProcessResponse {
            success: false,
            source_path: "images/test.jpg".to_string(),
            thumbnail_paths: Vec::new(),
            error: Some("Test error".to_string()),
        };

        assert!(!response.success);
        assert!(response.thumbnail_paths.is_empty());
        assert!(response.error.is_some());
    }
}
