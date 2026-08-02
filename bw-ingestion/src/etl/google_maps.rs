//! Google Maps data transformer for ETL pipeline.
//!
//! Transforms raw Google Maps API data into normalized Business records.

use super::transformer::{transform_to_business, RawBusinessData};
use super::Transformer;
use crate::Business;
use anyhow::Result;
use uuid::Uuid;

/// Default category ID for businesses without explicit category mapping.
const DEFAULT_CATEGORY_ID: &str = "550e8400-e29b-41d4-a716-446655440000";

/// Google Maps-specific transformer.
pub struct GoogleMapsTransformer {
    category_id: Uuid,
}

impl GoogleMapsTransformer {
    pub fn new() -> Self {
        Self {
            category_id: Uuid::parse_str(DEFAULT_CATEGORY_ID)
                .expect("Invalid default category UUID"),
        }
    }

    pub fn with_category_id(category_id: Uuid) -> Self {
        Self { category_id }
    }

    /// Parse raw Google Maps JSON data into RawBusinessData.
    fn parse_google_maps_data(&self, raw: &serde_json::Value) -> Result<RawBusinessData> {
        let name = raw.get("displayName").and_then(|v| v.as_str()).map(String::from);
        let description = raw.get("description").and_then(|v| v.as_str()).map(String::from);
        let address = raw.get("formattedAddress").and_then(|v| v.as_str()).map(String::from);
        let phone = raw.get("primaryPhone").and_then(|v| v.as_str()).map(String::from);
        let website = raw.get("websiteUri").and_then(|v| v.as_str()).map(String::from);

        // Extract category from categories array
        let category = raw.get("categories").and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str())
            .map(String::from);

        let rating = raw.get("rating").and_then(|v| v.as_f64());

        // Google Maps uses reviewCount as u32
        let review_count = raw.get("reviewCount").and_then(|v| v.as_u64()).map(|v| v as u32);

        // Get first photo URL if available
        let image_url = raw.get("photos").and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.get("uri"))
            .and_then(|v| v.as_str())
            .map(String::from);

        Ok(RawBusinessData {
            name,
            description,
            address,
            phone,
            website,
            category,
            rating,
            review_count,
            image_url,
        })
    }
}

impl Default for GoogleMapsTransformer {
    fn default() -> Self {
        Self::new()
    }
}

impl Transformer for GoogleMapsTransformer {
    fn transform(&self, raw_data: &serde_json::Value) -> Result<Business> {
        let raw = self.parse_google_maps_data(raw_data)?;
        transform_to_business(&raw, self.category_id)
    }

    fn source_type(&self) -> &'static str {
        "google_maps"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_google_maps_business(name: &str) -> serde_json::Value {
        serde_json::json!({
            "name": "places/abc123",
            "displayName": name,
            "description": "A wonderful business",
            "formattedAddress": "789 Business Blvd, Suite 100, Chicago, IL 60601",
            "primaryPhone": "+1-555-5678",
            "websiteUri": "https://googlemaps-business.com",
            "categories": ["cafe", "coffee_shop"],
            "rating": 4.7,
            "reviewCount": 256,
            "photos": [
                {"uri": "https://maps.googleapis.com/photo1.jpg"},
                {"uri": "https://maps.googleapis.com/photo2.jpg"}
            ]
        })
    }

    #[test]
    fn test_transform_google_maps_business() {
        let transformer = GoogleMapsTransformer::new();
        let raw = create_google_maps_business("Google Maps Business");

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Google Maps Business");
        assert_eq!(business.description, Some("A wonderful business".to_string()));
    }

    #[test]
    fn test_transform_google_maps_missing_name() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "name": "places/abc123",
            "formattedAddress": "123 Street"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_transform_google_maps_minimal() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "name": "places/abc123",
            "displayName": "Minimal GM Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Minimal GM Business");
    }

    #[test]
    fn test_source_type() {
        let transformer = GoogleMapsTransformer::new();
        assert_eq!(transformer.source_type(), "google_maps");
    }

    #[test]
    fn test_transform_with_all_fields() {
        let transformer = GoogleMapsTransformer::new();
        let raw = create_google_maps_business("Full GM Business");

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Full GM Business");
        assert_eq!(business.description, Some("A wonderful business".to_string()));
        assert_eq!(business.verified, false);
    }

    #[test]
    fn test_transform_with_missing_optional_fields() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Minimal Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Minimal Business");
        assert!(business.description.is_none());
    }

    #[test]
    fn test_extract_photo_url() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Business with Photos",
            "photos": [
                {"uri": "https://maps.googleapis.com/photo1.jpg"},
                {"uri": "https://maps.googleapis.com/photo2.jpg"}
            ]
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
    }

    #[test]
    fn test_transform_with_no_photos() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Business without Photos"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        // image_url is optional, so this should still work
        assert!(business.description.is_none());
    }
}
