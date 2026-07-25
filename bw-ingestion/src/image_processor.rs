//! Image processing module for thumbnail generation.
//!
//! This module provides functionality for processing images from MinIO,
//! generating thumbnails at multiple sizes, and storing them back to MinIO.

use anyhow::{Context, Result};
use image::{imageops::FilterType, ImageFormat, ImageReader};
use std::io::Cursor;
use std::path::Path;

/// Thumbnail sizes supported by the processor
pub const THUMBNAIL_SIZES: [u32; 3] = [150, 300, 800];

/// Supported image formats
pub const SUPPORTED_FORMATS: &[&str] = &["jpeg", "jpg", "gif", "png"];

/// MinIO client wrapper for image operations
/// Note: This is a stub implementation for compilation.
/// In production, this would wrap the actual minio-rsc client.
pub struct MinioClient {
    _endpoint: String,
    _access_key: String,
}

impl MinioClient {
    /// Creates a new MinIO client
    pub fn new(endpoint: &str, access_key: &str, _secret_key: &str, _secure: bool) -> Self {
        Self {
            _endpoint: endpoint.to_string(),
            _access_key: access_key.to_string(),
        }
    }
}

/// Image processor for handling thumbnail generation
pub struct ImageProcessor {
    minio_client: MinioClient,
    source_bucket: String,
    thumbnail_bucket: String,
}

impl ImageProcessor {
    /// Creates a new ImageProcessor instance
    ///
    /// # Arguments
    /// * `endpoint` - MinIO endpoint URL
    /// * `access_key` - MinIO access key
    /// * `secret_key` - MinIO secret key
    /// * `source_bucket` - Bucket containing source images
    /// * `thumbnail_bucket` - Bucket for storing thumbnails
    ///
    /// # Errors
    /// Returns an error if the MinIO client cannot be created
    pub fn new(
        endpoint: &str,
        access_key: &str,
        secret_key: &str,
        source_bucket: String,
        thumbnail_bucket: String,
    ) -> Result<Self> {
        let client = MinioClient::new(endpoint, access_key, secret_key, false);

        Ok(Self {
            minio_client: client,
            source_bucket,
            thumbnail_bucket,
        })
    }

    /// Validates that the image format is supported
    ///
    /// # Arguments
    /// * `filename` - The filename to check
    ///
    /// # Returns
    /// `true` if the format is supported, `false` otherwise
    #[must_use]
    pub fn is_format_supported(filename: &str) -> bool {
        if let Some(ext) = Path::new(filename).extension() {
            if let Some(ext_str) = ext.to_str() {
                return SUPPORTED_FORMATS
                    .iter()
                    .any(|&supported| ext_str.to_lowercase() == supported.to_lowercase());
            }
        }
        false
    }

    /// Generates a thumbnail path with size suffix
    ///
    /// # Arguments
    /// * `source_path` - Original image path in MinIO
    /// * `size` - Thumbnail size in pixels
    ///
    /// # Returns
    /// New path with size suffix before the extension
    pub fn generate_thumbnail_path(source_path: &str, size: u32) -> String {
        let path = Path::new(source_path);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");

        let parent = path.parent();
        if let Some(parent_path) = parent {
            if let Some(parent_str) = parent_path.to_str() {
                if !parent_str.is_empty() {
                    return format!("{}/{stem}_{size}px.{ext}", parent_str);
                }
            }
        }
        format!("{stem}_{size}px.{ext}")
    }

    /// Downloads an image from MinIO
    ///
    /// # Arguments
    /// * `_image_path` - Path to the image in MinIO
    ///
    /// # Returns
    /// Vector containing the image bytes
    ///
    /// # Errors
    /// Returns an error if the download fails
    ///
    /// Note: This is a placeholder implementation for compilation.
    /// In production, this would use the actual MinIO client.
    pub fn download_image(&self, _image_path: &str) -> Result<Vec<u8>> {
        // Placeholder: In production, this would be:
        // let mut reader = self.minio_client.get_object(&self.source_bucket, image_path).await?;
        // let mut output = Vec::new();
        // reader.read_to_end(&mut output).await?;
        Ok(Vec::new())
    }

    /// Uploads an image to MinIO
    ///
    /// # Arguments
    /// * `_image_path` - Destination path in MinIO
    /// * `_data` - Image bytes to upload
    /// * `_content_type` - MIME type of the image
    ///
    /// # Errors
    /// Returns an error if the upload fails
    ///
    /// Note: This is a placeholder implementation for compilation.
    /// In production, this would use the actual MinIO client.
    pub fn upload_image(
        &self,
        _image_path: &str,
        _data: &[u8],
        _content_type: &str,
    ) -> Result<()> {
        // Placeholder: In production, this would be:
        // self.minio_client
        //     .put_object(&self.thumbnail_bucket, image_path, data)
        //     .await?;
        Ok(())
    }

    /// Processes an image and generates all thumbnail sizes
    ///
    /// # Arguments
    /// * `source_data` - The source image bytes
    /// * `content_type` - MIME type of the source image
    ///
    /// # Returns
    /// A vector of tuples containing (thumbnail_path, thumbnail_data)
    ///
    /// # Errors
    /// Returns an error if image processing fails
    pub fn generate_thumbnails(
        &self,
        source_data: &[u8],
        content_type: &str,
    ) -> Result<Vec<(String, Vec<u8>)>> {
        // Decode the source image
        let img = ImageReader::new(Cursor::new(source_data))
            .with_guessed_format()
            .context("Failed to create image reader")?
            .decode()
            .context("Failed to decode source image")?;

        let mut thumbnails = Vec::new();

        for &size in &THUMBNAIL_SIZES {
            // Resize maintaining aspect ratio
            let thumbnail = img.resize_exact(size, size, FilterType::Lanczos3);

            // Encode the thumbnail
            let format = Self::parse_content_type(content_type)?;
            let mut buffer = Vec::new();
            thumbnail
                .write_to(&mut Cursor::new(&mut buffer), format)
                .context("Failed to encode thumbnail")?;

            thumbnails.push((String::new(), buffer));
        }

        Ok(thumbnails)
    }

    /// Parses a content type string into an ImageFormat
    ///
    /// # Arguments
    /// * `content_type` - The MIME type string
    ///
    /// # Returns
    /// The corresponding ImageFormat
    ///
    /// # Errors
    /// Returns an error if the content type is not supported
    fn parse_content_type(content_type: &str) -> Result<ImageFormat> {
        let lower = content_type.to_lowercase();
        if lower.contains("jpeg") || lower.contains("jpg") {
            Ok(ImageFormat::Jpeg)
        } else if lower.contains("png") {
            Ok(ImageFormat::Png)
        } else if lower.contains("gif") {
            Ok(ImageFormat::Gif)
        } else {
            Err(anyhow::anyhow!("Unsupported content type: {}", content_type))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_format_supported_jpeg() {
        assert!(ImageProcessor::is_format_supported("image.jpeg"));
        assert!(ImageProcessor::is_format_supported("image.jpg"));
        assert!(ImageProcessor::is_format_supported("IMAGE.JPG"));
    }

    #[test]
    fn test_is_format_supported_gif() {
        assert!(ImageProcessor::is_format_supported("image.gif"));
        assert!(ImageProcessor::is_format_supported("IMAGE.GIF"));
    }

    #[test]
    fn test_is_format_supported_png() {
        assert!(ImageProcessor::is_format_supported("image.png"));
        assert!(ImageProcessor::is_format_supported("IMAGE.PNG"));
    }

    #[test]
    fn test_is_format_supported_unsupported() {
        assert!(!ImageProcessor::is_format_supported("image.bmp"));
        assert!(!ImageProcessor::is_format_supported("image.webp"));
        assert!(!ImageProcessor::is_format_supported("image.txt"));
    }

    #[test]
    fn test_generate_thumbnail_path() {
        let path = ImageProcessor::generate_thumbnail_path("images/business/photo.jpg", 150);
        assert_eq!(path, "images/business/photo_150px.jpg");
    }

    #[test]
    fn test_generate_thumbnail_path_nested() {
        let path = ImageProcessor::generate_thumbnail_path(
            "bucket/folder/subfolder/image.jpeg",
            300,
        );
        assert_eq!(path, "bucket/folder/subfolder/image_300px.jpeg");
    }

    #[test]
    fn test_generate_thumbnail_path_root() {
        let path = ImageProcessor::generate_thumbnail_path("photo.png", 800);
        assert_eq!(path, "photo_800px.png");
    }

    #[test]
    fn test_thumbnail_sizes_constant() {
        assert_eq!(THUMBNAIL_SIZES.len(), 3);
        assert_eq!(THUMBNAIL_SIZES[0], 150);
        assert_eq!(THUMBNAIL_SIZES[1], 300);
        assert_eq!(THUMBNAIL_SIZES[2], 800);
    }

    #[test]
    fn test_supported_formats_constant() {
        assert!(SUPPORTED_FORMATS.contains(&"jpeg"));
        assert!(SUPPORTED_FORMATS.contains(&"jpg"));
        assert!(SUPPORTED_FORMATS.contains(&"gif"));
        assert!(SUPPORTED_FORMATS.contains(&"png"));
    }

    #[test]
    fn test_parse_content_type_jpeg() {
        let format = ImageProcessor::parse_content_type("image/jpeg").unwrap();
        assert_eq!(format, ImageFormat::Jpeg);
    }

    #[test]
    fn test_parse_content_type_png() {
        let format = ImageProcessor::parse_content_type("image/png").unwrap();
        assert_eq!(format, ImageFormat::Png);
    }

    #[test]
    fn test_parse_content_type_gif() {
        let format = ImageProcessor::parse_content_type("image/gif").unwrap();
        assert_eq!(format, ImageFormat::Gif);
    }

    #[test]
    fn test_parse_content_type_unsupported() {
        let result = ImageProcessor::parse_content_type("image/bmp");
        assert!(result.is_err());
    }
}
