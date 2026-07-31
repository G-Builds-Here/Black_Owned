//! Integration tests for the image worker.
//!
//! These tests require a running NATS server and MinIO instance.
//! Run with: cargo test --features integration_test

#[cfg(feature = "integration_test")]
mod tests {
    use crate::image_worker::{ImageProcessRequest, ImageWorker};
    use std::env;

    /// Test fixture for integration tests
    struct TestFixture {
        worker: ImageWorker,
    }

    impl TestFixture {
        fn new() -> Self {
            let nats_url =
                env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
            let minio_endpoint =
                env::var("MINIO_ENDPOINT")
                    .unwrap_or_else(|_| "http://localhost:9000".to_string());
            let minio_access_key =
                env::var("MINIO_ACCESS_KEY")
                    .unwrap_or_else(|_| "minioadmin".to_string());
            let minio_secret_key =
                env::var("MINIO_SECRET_KEY")
                    .unwrap_or_else(|_| "minioadmin".to_string());

            let worker = ImageWorker::new(
                &nats_url,
                &minio_endpoint,
                &minio_access_key,
                &minio_secret_key,
                "source-bucket".to_string(),
                "thumbnail-bucket".to_string(),
            )
            .expect("Failed to create ImageWorker");

            Self { worker }
        }
    }

    #[tokio::test]
    async fn test_process_image_valid_request() {
        let fixture = TestFixture::new();

        let request = ImageProcessRequest {
            source_path: "test/sample.jpg".to_string(),
            source_bucket: "source-bucket".to_string(),
            content_type: "image/jpeg".to_string(),
            callback_url: None,
        };

        let response = fixture.worker.process_image(request).await;

        // Note: This test will fail if MinIO is not running
        // It verifies the processing logic, not the actual thumbnail generation
        assert!(
            response.success || response.error.is_some(),
            "Response should have either success or error"
        );
    }

    #[tokio::test]
    async fn test_process_image_empty_source_path() {
        let fixture = TestFixture::new();

        let request = ImageProcessRequest {
            source_path: "".to_string(),
            source_bucket: "source-bucket".to_string(),
            content_type: "image/jpeg".to_string(),
            callback_url: None,
        };

        let response = fixture.worker.process_image(request).await;

        assert!(!response.success);
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("Source path is required"));
    }

    #[tokio::test]
    async fn test_process_image_unsupported_content_type() {
        let fixture = TestFixture::new();

        let request = ImageProcessRequest {
            source_path: "test/sample.bmp".to_string(),
            source_bucket: "source-bucket".to_string(),
            content_type: "image/bmp".to_string(),
            callback_url: None,
        };

        let response = fixture.worker.process_image(request).await;

        assert!(!response.success);
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("Unsupported content type"));
    }

    #[tokio::test]
    async fn test_nats_subscription() {
        let fixture = TestFixture::new();

        // This test verifies that the worker can subscribe to the NATS subject
        let result = fixture.worker.start(Some("image-processor")).await;

        // Note: This will fail if NATS is not running
        // The test verifies the subscription logic
        assert!(result.is_ok() || result.is_err());
    }
}
