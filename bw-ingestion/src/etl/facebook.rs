//! Facebook data transformer for ETL pipeline.
//!
//! Transforms raw Facebook Graph API data into normalized Business records.

use super::transformer::{transform_to_business, RawBusinessData};
use super::Transformer;
use crate::Business;
use anyhow::Result;
use uuid::Uuid;

/// Default category ID for businesses without explicit category mapping.
const DEFAULT_CATEGORY_ID: &str = "550e8400-e29b-41d4-a716-446655440000";

/// Facebook-specific transformer.
pub struct FacebookTransformer {
    category_id: Uuid,
}

impl FacebookTransformer {
    pub fn new() -> Self {
        Self {
            category_id: Uuid::parse_str(DEFAULT_CATEGORY_ID)
                .expect("Invalid default category UUID"),
        }
    }

    pub fn with_category_id(category_id: Uuid) -> Self {
        Self { category_id }
    }

    /// Parse raw Facebook Graph API JSON data into RawBusinessData.
    fn parse_facebook_data(&self, raw: &serde_json::Value) -> Result<RawBusinessData> {
        let name = raw.get("name").and_then(|v| v.as_str()).map(String::from);
        let description = raw.get("about").and_then(|v| v.as_str()).map(String::from);
        let address = self.extract_address(raw);
        let phone = raw.get("phone").and_then(|v| v.as_str()).map(String::from);
        let website = raw.get("website").and_then(|v| v.as_str()).map(String::from);

        // Facebook uses "category" or "category_list"
        let category = raw.get("category").and_then(|v| v.as_str()).map(String::from)
            .or_else(|| raw.get("category_list").and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .map(String::from));

        let rating = raw.get("overall_star_rating").and_then(|v| v.as_f64());
        let review_count = raw.get("rating_count").and_then(|v| v.as_u64()).map(|v| v as u32);

        // Get profile picture URL
        let image_url = raw.get("picture").and_then(|v| v.get("data"))
            .and_then(|v| v.get("url"))
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

    /// Extract address from Facebook location object.
    fn extract_address(&self, raw: &serde_json::Value) -> Option<String> {
        let location = raw.get("location");
        if let Some(loc) = location {
            let street = loc.get("street").and_then(|v| v.as_str()).unwrap_or("");
            let city = loc.get("city").and_then(|v| v.as_str()).unwrap_or("");
            let state = loc.get("state").and_then(|v| v.as_str()).unwrap_or("");
            let zip = loc.get("zip").and_then(|v| v.as_str()).unwrap_or("");

            let parts: Vec<&str> = vec![street, city, state, zip]
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

impl Default for FacebookTransformer {
    fn default() -> Self {
        Self::new()
    }
}

impl Transformer for FacebookTransformer {
    fn transform(&self, raw_data: &serde_json::Value) -> Result<Business> {
        let raw = self.parse_facebook_data(raw_data)?;
        transform_to_business(&raw, self.category_id)
    }

    fn source_type(&self) -> &'static str {
        "facebook"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_facebook_business(name: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "fb-page-123",
            "name": name,
            "about": "Facebook business description",
            "phone": "+1-555-9999",
            "website": "https://facebook-business.com",
            "category": "Business Service",
            "location": {
                "street": "321 Social Media Lane",
                "city": "New York",
                "state": "NY",
                "zip": "10001"
            },
            "overall_star_rating": 4.2,
            "rating_count": 89,
            "picture": {
                "data": {
                    "url": "https://facebook.com/profile.jpg"
                }
            }
        })
    }

    #[test]
    fn test_transform_facebook_business() {
        let transformer = FacebookTransformer::new();
        let raw = create_facebook_business("Facebook Business");

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Facebook Business");
        assert_eq!(business.description, Some("Facebook business description".to_string()));
    }

    #[test]
    fn test_transform_facebook_missing_name() {
        let transformer = FacebookTransformer::new();
        let raw = serde_json::json!({
            "id": "fb-page-123",
            "about": "No name business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_transform_facebook_minimal() {
        let transformer = FacebookTransformer::new();
        let raw = serde_json::json!({
            "id": "fb-page-123",
            "name": "Minimal FB Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Minimal FB Business");
    }

    #[test]
    fn test_extract_address_full() {
        let transformer = FacebookTransformer::new();
        let raw = serde_json::json!({
            "location": {
                "street": "123 Facebook Rd",
                "city": "Menlo Park",
                "state": "CA",
                "zip": "94025"
            }
        });

        let address = transformer.extract_address(&raw);
        assert_eq!(address, Some("123 Facebook Rd, Menlo Park, CA, 94025".to_string()));
    }

    #[test]
    fn test_extract_address_empty() {
        let transformer = FacebookTransformer::new();
        let raw = serde_json::json!({
            "location": {}
        });

        let address = transformer.extract_address(&raw);
        assert!(address.is_none());
    }

    #[test]
    fn test_source_type() {
        let transformer = FacebookTransformer::new();
        assert_eq!(transformer.source_type(), "facebook");
    }

    #[test]
    fn test_transform_with_all_fields() {
        let transformer = FacebookTransformer::new();
        let raw = create_facebook_business("Full FB Business");

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Full FB Business");
        assert_eq!(business.description, Some("Facebook business description".to_string()));
        assert_eq!(business.verified, false);
    }

    #[test]
    fn test_transform_with_missing_optional_fields() {
        let transformer = FacebookTransformer::new();
        let raw = serde_json::json!({
            "name": "Minimal Business"
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Minimal Business");
        assert!(business.description.is_none());
    }

    #[test]
    fn test_transform_with_category_list() {
        let transformer = FacebookTransformer::new();
        let raw = serde_json::json!({
            "name": "Categorized FB Business",
            "category_list": [
                {"id": "1", "name": "Business"},
                {"id": "2", "name": "Service"}
            ]
        });

        let result = transformer.transform(&raw);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Categorized FB Business");
    }

    #[test]
    fn test_extract_address_partial() {
        let transformer = FacebookTransformer::new();
        let raw = serde_json::json!({
            "location": {
                "street": "456 Street",
                "city": "Los Angeles"
            }
        });

        let address = transformer.extract_address(&raw);
        assert_eq!(address, Some("456 Street, Los Angeles".to_string()));
    }
}
