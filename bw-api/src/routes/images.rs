//! Image upload and processing routes.

use crate::{ApiResponse, graphql::schema::Schema};
use axum::{Router, routing::get};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

/// Maximum file size: 10MB (reserved for future use)
#[allow(dead_code)]
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

/// Supported image extensions
const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif"];

/// Image upload request
#[derive(Debug, Deserialize)]
pub struct ImageUploadRequest {
    /// Business ID to associate with the image
    pub business_id: String,
    /// Image file name (must have supported extension)
    pub file_name: String,
}

/// Image upload response
#[derive(Debug, Serialize)]
pub struct ImageUploadResponse {
    /// Unique ID for the uploaded image
    pub image_id: Uuid,
    /// Path where the image will be stored in MinIO
    pub storage_path: String,
    /// Status of the processing request
    pub processing_status: String,
}

/// Image processing request payload for NATS
#[derive(Debug, Serialize)]
pub struct ImageProcessingPayload {
    /// Path to the source image in MinIO
    pub source_path: String,
    /// Optional bucket name override
    pub bucket: Option<String>,
}

/// Validates that a file has a supported image extension
///
/// # Arguments
/// * `file_name` - The name of the file to validate
///
/// # Returns
/// * `true` if the file has a supported extension (case-insensitive)
/// * `false` otherwise
#[must_use]
pub fn is_supported_image_format(file_name: &str) -> bool {
    Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext_lower = ext.to_lowercase();
            SUPPORTED_EXTENSIONS.contains(&ext_lower.as_str())
        })
        .unwrap_or(false)
}

/// Generates a unique storage path for an uploaded image
///
/// Creates a path in the format: `images/<business_id>/<timestamp>_<filename>`
///
/// # Arguments
/// * `business_id` - The business ID to associate with the image
/// * `file_name` - The original file name
///
/// # Returns
/// A unique storage path string
#[must_use]
pub fn generate_storage_path(business_id: &str, file_name: &str) -> String {
    let image_id = Uuid::new_v4();
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");

    format!("images/{}/{}_{}.{}", business_id, stem, image_id, ext)
}

/// Validates an image upload request
///
/// # Arguments
/// * `request` - The upload request to validate
///
/// # Errors
/// Returns an error if:
/// - The business ID is invalid
/// - The file name is empty
/// - The file extension is not supported
///
/// # Returns
/// * `Ok(())` if validation passes
/// * `Err(String)` with validation error message
pub fn validate_upload_request(request: &ImageUploadRequest) -> Result<(), String> {
    if request.business_id.is_empty() {
        return Err("Business ID is required".to_string());
    }

    if Uuid::parse_str(&request.business_id).is_err() {
        return Err("Invalid business ID format".to_string());
    }

    if request.file_name.is_empty() {
        return Err("File name is required".to_string());
    }

    if !is_supported_image_format(&request.file_name) {
        return Err(format!(
            "Unsupported file format. Supported: {:?}",
            SUPPORTED_EXTENSIONS
        ));
    }

    Ok(())
}

/// Handler for image upload requests
///
/// # Arguments
/// * `request` - The upload request containing business_id and file_name
///
/// # Errors
/// Returns an error response if validation fails
///
/// # Returns
/// A success response with the image ID and storage path
pub fn handle_image_upload(
    request: &ImageUploadRequest,
) -> Result<ApiResponse<ImageUploadResponse>, String> {
    validate_upload_request(request)?;

    let image_id = Uuid::new_v4();
    let storage_path = generate_storage_path(&request.business_id, &request.file_name);

    let response = ImageUploadResponse {
        image_id,
        storage_path: storage_path.clone(),
        processing_status: "queued".to_string(),
    };

    Ok(ApiResponse::success(response))
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_supported_image_format_jpeg() {
        assert!(is_supported_image_format("photo.jpg"));
        assert!(is_supported_image_format("photo.jpeg"));
        assert!(is_supported_image_format("PHOTO.JPG"));
        assert!(is_supported_image_format("photo.JPEG"));
    }

    #[test]
    fn test_is_supported_image_format_png() {
        assert!(is_supported_image_format("image.png"));
        assert!(is_supported_image_format("IMAGE.PNG"));
    }

    #[test]
    fn test_is_supported_image_format_gif() {
        assert!(is_supported_image_format("animation.gif"));
        assert!(is_supported_image_format("ANIMATION.GIF"));
    }

    #[test]
    fn test_is_supported_image_format_unsupported() {
        assert!(!is_supported_image_format("image.webp"));
        assert!(!is_supported_image_format("image.bmp"));
        assert!(!is_supported_image_format("image.tiff"));
        assert!(!is_supported_image_format("image"));
        assert!(!is_supported_image_format("document.pdf"));
    }

    #[test]
    fn test_generate_storage_path() {
        let business_id = "12345678-1234-1234-1234-123456789abc";
        let file_name = "photo.jpg";

        let path = generate_storage_path(business_id, file_name);

        assert!(path.starts_with("images/"));
        assert!(path.contains(business_id));
        assert!(path.contains("photo_"));
        assert!(path.ends_with(".jpg"));
    }

    #[test]
    fn test_generate_storage_path_unique_ids() {
        let business_id = "12345678-1234-1234-1234-123456789abc";
        let file_name = "photo.jpg";

        let path1 = generate_storage_path(business_id, file_name);
        let path2 = generate_storage_path(business_id, file_name);

        assert_ne!(path1, path2);
    }

    #[test]
    fn test_generate_storage_path_nested_directories() {
        let business_id = "12345678-1234-1234-1234-123456789abc";
        let file_name = "uploads/photo.jpg";

        let path = generate_storage_path(business_id, file_name);

        assert!(path.starts_with("images/"));
        assert!(path.contains(business_id));
        assert!(path.contains("photo_"));
        assert!(path.ends_with(".jpg"));
    }

    #[test]
    fn test_validate_upload_request_valid() {
        let request = ImageUploadRequest {
            business_id: "12345678-1234-1234-1234-123456789abc".to_string(),
            file_name: "photo.jpg".to_string(),
        };

        assert!(validate_upload_request(&request).is_ok());
    }

    #[test]
    fn test_validate_upload_request_empty_business_id() {
        let request = ImageUploadRequest {
            business_id: String::new(),
            file_name: "photo.jpg".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Business ID is required"));
    }

    #[test]
    fn test_validate_upload_request_invalid_business_id() {
        let request = ImageUploadRequest {
            business_id: "not-a-uuid".to_string(),
            file_name: "photo.jpg".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid business ID format"));
    }

    #[test]
    fn test_validate_upload_request_empty_file_name() {
        let request = ImageUploadRequest {
            business_id: "12345678-1234-1234-1234-123456789abc".to_string(),
            file_name: String::new(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File name is required"));
    }

    #[test]
    fn test_validate_upload_request_unsupported_format() {
        let request = ImageUploadRequest {
            business_id: "12345678-1234-1234-1234-123456789abc".to_string(),
            file_name: "document.pdf".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported file format"));
    }

    #[test]
    fn test_handle_image_upload_success() {
        let request = ImageUploadRequest {
            business_id: "12345678-1234-1234-1234-123456789abc".to_string(),
            file_name: "photo.jpg".to_string(),
        };

        let result = handle_image_upload(&request);

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.success);
        assert!(response.data.is_some());

        let data = response.data.unwrap();
        assert_eq!(data.processing_status, "queued");
        assert!(data.storage_path.starts_with("images/"));
    }

    #[test]
    fn test_handle_image_upload_failure() {
        let request = ImageUploadRequest {
            business_id: "invalid".to_string(),
            file_name: "photo.jpg".to_string(),
        };

        let result = handle_image_upload(&request);

        assert!(result.is_err());
    }

}

/// Create the images router
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/", get(|| async { "Images endpoint" }))
}
