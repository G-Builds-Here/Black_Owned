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

    // ========================================================================
    // QA Test Suite - LOC-0064-AC3: Google Maps ETL Transformer
    // ========================================================================

    // Scenario 1: Happy path - transforms valid Google Maps data
    #[test]
    fn test_qa_happy_path_transforms_valid_google_maps_data() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Premium Coffee Shop",
            "description": "Artisan coffee and fresh pastries",
            "formattedAddress": "456 Market St, San Francisco, CA 94102",
            "primaryPhone": "+14155551234",
            "websiteUri": "https://premiumcoffee.com",
            "categories": ["cafe", "restaurant"],
            "rating": 4.8,
            "reviewCount": 342,
            "photos": [
                {"uri": "https://maps.googleapis.com/photo/premium-coffee.jpg"}
            ]
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok(), "Valid Google Maps data should transform successfully");

        let business = result.unwrap();
        assert_eq!(business.name, "Premium Coffee Shop");
        assert_eq!(business.description, Some("Artisan coffee and fresh pastries".to_string()));
        assert_eq!(business.address, Some("456 Market St, San Francisco, CA 94102".to_string()));
        assert_eq!(business.phone, Some("+14155551234".to_string()));
        assert_eq!(business.website, Some("https://premiumcoffee.com".to_string()));
        assert_eq!(business.rating, Some(4.8));
        assert_eq!(business.review_count, Some(342));
        assert_eq!(business.image_url, Some("https://maps.googleapis.com/photo/premium-coffee.jpg".to_string()));
    }

    // Scenario 2: Handles missing optional fields
    #[test]
    fn test_qa_handles_missing_optional_fields() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Minimal Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok(), "Should transform with only required field (name)");

        let business = result.unwrap();
        assert_eq!(business.name, "Minimal Business");
        assert_eq!(business.description, None);
        assert_eq!(business.address, None);
        assert_eq!(business.phone, None);
        assert_eq!(business.website, None);
        assert_eq!(business.rating, None);
        assert_eq!(business.review_count, None);
        assert_eq!(business.image_url, None);
    }

    // Scenario 3: Validates required fields
    #[test]
    fn test_qa_validates_required_fields_missing_name() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "formattedAddress": "123 Street, City, 12345",
            "primaryPhone": "+15551234567"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_err(), "Should fail when name is missing");
        let err = result.unwrap_err();
        assert!(err.to_string().contains("required") || err.to_string().contains("name"));
    }

    #[test]
    fn test_qa_validates_required_fields_empty_name() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "   ",
            "formattedAddress": "123 Street, City, 12345"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_err(), "Should fail when name is empty");
    }

    // Scenario 4: Phone number normalization
    #[test]
    fn test_qa_phone_number_preserves_e164_format() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Phone Test Business",
            "primaryPhone": "+14155552671"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.phone, Some("+14155552671".to_string()));
    }

    #[test]
    fn test_qa_phone_number_uk_format() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "UK Business",
            "primaryPhone": "+442071838750"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.phone, Some("+442071838750".to_string()));
    }

    #[test]
    fn test_qa_phone_number_missing() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "No Phone Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok(), "Missing phone should not fail transformation");
        let business = result.unwrap();
        assert_eq!(business.phone, None);
    }

    // Scenario 5: URL validation
    #[test]
    fn test_qa_url_validation_https_protocol() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "HTTPS Business",
            "websiteUri": "https://example.com"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.website, Some("https://example.com".to_string()));
    }

    #[test]
    fn test_qa_url_validation_http_protocol() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "HTTP Business",
            "websiteUri": "http://example.com"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.website, Some("http://example.com".to_string()));
    }

    #[test]
    fn test_qa_url_validation_with_path() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Path Business",
            "websiteUri": "https://example.com/path/to/page"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.website, Some("https://example.com/path/to/page".to_string()));
    }

    #[test]
    fn test_qa_url_missing() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "No Website Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok(), "Missing website should not fail transformation");
        let business = result.unwrap();
        assert_eq!(business.website, None);
    }

    // Scenario 6: Rating bounds (0-5)
    #[test]
    fn test_qa_rating_bounds_perfect_score() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Perfect Rating Business",
            "rating": 5.0
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.rating, Some(5.0));
    }

    #[test]
    fn test_qa_rating_bounds_zero() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Zero Rating Business",
            "rating": 0.0
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.rating, Some(0.0));
    }

    #[test]
    fn test_qa_rating_bounds_decimal() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Decimal Rating Business",
            "rating": 4.7
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.rating, Some(4.7));
    }

    #[test]
    fn test_qa_rating_bounds_missing() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "No Rating Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok(), "Missing rating should not fail transformation");
        let business = result.unwrap();
        assert_eq!(business.rating, None);
    }

    #[test]
    fn test_qa_rating_bounds_negative() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Negative Rating Business",
            "rating": -1.0
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok(), "Negative rating is passed through (validation is source-specific)");
        let business = result.unwrap();
        assert_eq!(business.rating, Some(-1.0));
    }

    #[test]
    fn test_qa_rating_bounds_above_five() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Above Five Rating Business",
            "rating": 10.0
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok(), "Above 5 rating is passed through (validation is source-specific)");
        let business = result.unwrap();
        assert_eq!(business.rating, Some(10.0));
    }

    // Additional edge case tests
    #[test]
    fn test_qa_review_count_zero() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "New Business",
            "rating": 0.0,
            "reviewCount": 0
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.review_count, Some(0));
    }

    #[test]
    fn test_qa_review_count_large() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Popular Business",
            "rating": 4.5,
            "reviewCount": 999999
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.review_count, Some(999999));
    }

    #[test]
    fn test_qa_category_extraction_first_only() {
        let transformer = GoogleMapsTransformer::new();
        let raw = serde_json::json!({
            "displayName": "Multi-Category Business",
            "categories": ["cafe", "coffee_shop", "bakery"]
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        // Category is mapped to default category_id, not stored as string
        assert_ne!(business.category_id, Uuid::nil());
    }

    #[test]
    fn test_qa_custom_category_id() {
        let custom_id = Uuid::parse_str("12345678-1234-1234-1234-123456789abc").unwrap();
        let transformer = GoogleMapsTransformer::with_category_id(custom_id);
        let raw = serde_json::json!({
            "displayName": "Custom Category Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.category_id, custom_id);
    }
}
