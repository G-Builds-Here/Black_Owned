//! Yelp data transformer for ETL pipeline.
//!
//! Transforms raw Yelp API data into normalized Business records.

use super::transformer::{transform_to_business, RawBusinessData};
use super::Transformer;
use crate::Business;
use anyhow::Result;
use uuid::Uuid;

/// Default category ID for businesses without explicit category mapping.
const DEFAULT_CATEGORY_ID: &str = "550e8400-e29b-41d4-a716-446655440000";

/// Yelp-specific transformer.
pub struct YelpTransformer {
    category_id: Uuid,
}

impl YelpTransformer {
    pub fn new() -> Self {
        Self {
            category_id: Uuid::parse_str(DEFAULT_CATEGORY_ID)
                .expect("Invalid default category UUID"),
        }
    }

    pub fn with_category_id(category_id: Uuid) -> Self {
        Self { category_id }
    }

    /// Parse raw Yelp JSON data into RawBusinessData.
    fn parse_yelp_data(&self, raw: &serde_json::Value) -> Result<RawBusinessData> {
        let name = raw.get("name").and_then(|v| v.as_str()).map(String::from);
        let description = raw.get("description").and_then(|v| v.as_str()).map(String::from);
        let address = self.extract_address(raw);
        let phone = raw.get("phone").and_then(|v| v.as_str()).map(String::from);
        let website = raw.get("url").and_then(|v| v.as_str()).map(String::from);
        let category = raw.get("categories").and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.get("title"))
            .and_then(|v| v.as_str())
            .map(String::from);
        let rating = raw.get("rating").and_then(|v| v.as_f64());
        let review_count = raw.get("review_count").and_then(|v| v.as_u64()).map(|v| v as u32);
        let image_url = raw.get("image_url").and_then(|v| v.as_str()).map(String::from);

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

    /// Extract full address from Yelp data structure.
    fn extract_address(&self, raw: &serde_json::Value) -> Option<String> {
        let location = raw.get("location");
        if let Some(loc) = location {
            let address_line = loc.get("address1").and_then(|v| v.as_str()).unwrap_or("");
            let city = loc.get("city").and_then(|v| v.as_str()).unwrap_or("");
            let state = loc.get("state").and_then(|v| v.as_str()).unwrap_or("");
            let zip = loc.get("zip_code").and_then(|v| v.as_str()).unwrap_or("");

            let parts: Vec<&str> = vec![address_line, city, state, zip]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect();

            if parts.is_empty() {
                None
            } else {
                Some(parts.join(", "))
            }
        } else {
            None
        }
    }
}

impl Default for YelpTransformer {
    fn default() -> Self {
        Self::new()
    }
}

impl Transformer for YelpTransformer {
    fn transform(&self, raw_data: &serde_json::Value) -> Result<Business> {
        let raw = self.parse_yelp_data(raw_data)?;
        transform_to_business(&raw, self.category_id)
    }

    fn source_type(&self) -> &'static str {
        "yelp"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_yelp_business(name: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "test-yelp-id",
            "name": name,
            "description": "A great business",
            "location": {
                "address1": "123 Main St",
                "city": "Springfield",
                "state": "IL",
                "zip_code": "62701"
            },
            "phone": "+1-555-1234",
            "url": "https://example.com",
            "categories": [
                {"alias": "restaurants", "title": "Restaurants"}
            ],
            "rating": 4.5,
            "review_count": 127,
            "image_url": "https://example.com/image.jpg"
        })
    }

    #[test]
    fn test_transform_yelp_business() {
        let transformer = YelpTransformer::new();
        let raw = create_yelp_business("Test Yelp Business");

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Test Yelp Business");
        assert_eq!(business.description, Some("A great business".to_string()));
    }

    #[test]
    fn test_transform_yelp_missing_name() {
        let transformer = YelpTransformer::new();
        let raw = serde_json::json!({
            "id": "test-id",
            "location": {
                "address1": "123 Main St"
            }
        });

        let result = transformer.transform(&raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_transform_yelp_minimal_data() {
        let transformer = YelpTransformer::new();
        let raw = serde_json::json!({
            "id": "test-id",
            "name": "Minimal Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Minimal Business");
        assert!(business.description.is_none());
    }

    #[test]
    fn test_extract_address_full() {
        let transformer = YelpTransformer::new();
        let raw = serde_json::json!({
            "location": {
                "address1": "123 Main St",
                "city": "Springfield",
                "state": "IL",
                "zip_code": "62701"
            }
        });

        let address = transformer.extract_address(&raw);
        assert_eq!(address, Some("123 Main St, Springfield, IL, 62701".to_string()));
    }

    #[test]
    fn test_extract_address_partial() {
        let transformer = YelpTransformer::new();
        let raw = serde_json::json!({
            "location": {
                "address1": "456 Oak Ave",
                "city": "Chicago"
            }
        });

        let address = transformer.extract_address(&raw);
        assert_eq!(address, Some("456 Oak Ave, Chicago".to_string()));
    }

    #[test]
    fn test_extract_address_empty() {
        let transformer = YelpTransformer::new();
        let raw = serde_json::json!({
            "location": {}
        });

        let address = transformer.extract_address(&raw);
        assert!(address.is_none());
    }

    #[test]
    fn test_source_type() {
        let transformer = YelpTransformer::new();
        assert_eq!(transformer.source_type(), "yelp");
    }

    #[test]
    fn test_transform_with_custom_category() {
        let custom_category = Uuid::parse_str("12345678-1234-1234-1234-123456789abc").unwrap();
        let transformer = YelpTransformer::with_category_id(custom_category);
        let raw = create_yelp_business("Categorized Business");

        let result = transformer.transform(&raw).unwrap();
        assert_eq!(result.category_id, custom_category);
    }
}
