//! ETL Pipeline for orchestrating data transformation from multiple sources.
//!
//! This module provides the main ETL pipeline that coordinates scraping,
//! transformation, and import of business data from external sources.

use super::Transformer;
use super::{google_maps::GoogleMapsTransformer, yelp::YelpTransformer, facebook::FacebookTransformer};
use crate::Business;
use anyhow::{anyhow, Result};
use chrono::Utc;
use std::collections::HashMap;
use uuid::Uuid;

/// Source types supported by the ETL pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SourceType {
    GoogleMaps,
    Yelp,
    Facebook,
}

impl SourceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceType::GoogleMaps => "google_maps",
            SourceType::Yelp => "yelp",
            SourceType::Facebook => "facebook",
        }
    }

    pub fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "google_maps" | "googlemaps" | "google" => Ok(SourceType::GoogleMaps),
            "yelp" => Ok(SourceType::Yelp),
            "facebook" | "fb" => Ok(SourceType::Facebook),
            _ => Err(anyhow!("Unknown source type: {}", s)),
        }
    }
}

/// Configuration for the ETL pipeline.
#[derive(Debug, Clone)]
pub struct EtlPipelineConfig {
    pub category_id: Uuid,
    pub default_verified: bool,
}

impl Default for EtlPipelineConfig {
    fn default() -> Self {
        Self {
            category_id: Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000")
                .expect("Invalid default category UUID"),
            default_verified: false,
        }
    }
}

/// Result of an ETL transformation operation.
#[derive(Debug, Clone)]
pub struct TransformationResult {
    pub business: Business,
    pub source_type: SourceType,
    pub raw_id: String,
    pub transformed_at: chrono::DateTime<Utc>,
}

/// ETL Pipeline for transforming scraped data from multiple sources.
pub struct EtlPipeline {
    config: EtlPipelineConfig,
    transformers: HashMap<SourceType, Box<dyn Transformer>>,
}

impl EtlPipeline {
    /// Create a new ETL pipeline with default configuration.
    pub fn new() -> Self {
        Self::with_config(EtlPipelineConfig::default())
    }

    /// Create a new ETL pipeline with custom configuration.
    pub fn with_config(config: EtlPipelineConfig) -> Self {
        let mut transformers: HashMap<SourceType, Box<dyn Transformer>> = HashMap::new();

        transformers.insert(
            SourceType::GoogleMaps,
            Box::new(GoogleMapsTransformer::with_category_id(config.category_id)),
        );
        transformers.insert(
            SourceType::Yelp,
            Box::new(YelpTransformer::with_category_id(config.category_id)),
        );
        transformers.insert(
            SourceType::Facebook,
            Box::new(FacebookTransformer::with_category_id(config.category_id)),
        );

        Self {
            config,
            transformers,
        }
    }

    /// Transform raw JSON data from a specific source into a Business entity.
    pub fn transform(
        &self,
        source_type: SourceType,
        raw_data: &serde_json::Value,
        raw_id: &str,
    ) -> Result<TransformationResult> {
        let transformer = self
            .transformers
            .get(&source_type)
            .ok_or_else(|| anyhow!("No transformer registered for source: {:?}", source_type))?;

        let business = transformer.transform(raw_data)?;

        Ok(TransformationResult {
            business,
            source_type,
            raw_id: raw_id.to_string(),
            transformed_at: Utc::now(),
        })
    }

    /// Transform multiple records from the same source.
    pub fn transform_batch(
        &self,
        source_type: SourceType,
        raw_data: &[serde_json::Value],
    ) -> Result<Vec<TransformationResult>> {
        let mut results = Vec::with_capacity(raw_data.len());

        for (i, record) in raw_data.iter().enumerate() {
            let raw_id = format!("{}-{}", source_type.as_str(), i);
            match self.transform(source_type, record, &raw_id) {
                Ok(result) => results.push(result),
                Err(e) => {
                    // Log error but continue processing other records
                    eprintln!("Failed to transform record {}: {}", raw_id, e);
                }
            }
        }

        Ok(results)
    }

    /// Get list of supported source types.
    pub fn supported_sources(&self) -> Vec<SourceType> {
        vec![
            SourceType::GoogleMaps,
            SourceType::Yelp,
            SourceType::Facebook,
        ]
    }

    /// Check if a source type is supported.
    pub fn is_source_supported(&self, source_type: &SourceType) -> bool {
        self.transformers.contains_key(source_type)
    }

    /// Get the number of registered transformers.
    pub fn transformer_count(&self) -> usize {
        self.transformers.len()
    }
}

impl Default for EtlPipeline {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_google_maps_record() -> serde_json::Value {
        serde_json::json!({
            "displayName": "Test Google Maps Business",
            "description": "A test business from Google Maps",
            "formattedAddress": "123 Main St, Chicago, IL 60601",
            "primaryPhone": "+1-555-1234",
            "websiteUri": "https://test-gm.com",
            "categories": ["restaurant"],
            "rating": 4.5,
            "reviewCount": 100
        })
    }

    fn create_yelp_record() -> serde_json::Value {
        serde_json::json!({
            "name": "Test Yelp Business",
            "description": "A test business from Yelp",
            "location": {
                "address1": "456 Oak Ave",
                "city": "New York",
                "state": "NY",
                "zip_code": "10001"
            },
            "phone": "+1-555-5678",
            "url": "https://test-yelp.com",
            "categories": [{"title": "cafe"}],
            "rating": 4.2,
            "review_count": 75
        })
    }

    fn create_facebook_record() -> serde_json::Value {
        serde_json::json!({
            "name": "Test Facebook Business",
            "about": "A test business from Facebook",
            "phone": "+1-555-9999",
            "website": "https://test-fb.com",
            "category": "Business",
            "location": {
                "street": "789 Social Blvd",
                "city": "San Francisco",
                "state": "CA",
                "zip": "94102"
            },
            "overall_star_rating": 4.0,
            "rating_count": 50
        })
    }

    #[test]
    fn test_transform_google_maps() {
        let pipeline = EtlPipeline::new();
        let raw = create_google_maps_record();

        let result = pipeline.transform(SourceType::GoogleMaps, &raw, "gm-123");
        assert!(result.is_ok());

        let transformation = result.unwrap();
        assert_eq!(transformation.source_type, SourceType::GoogleMaps);
        assert_eq!(transformation.raw_id, "gm-123");
        assert_eq!(transformation.business.name, "Test Google Maps Business");
    }

    #[test]
    fn test_transform_yelp() {
        let pipeline = EtlPipeline::new();
        let raw = create_yelp_record();

        let result = pipeline.transform(SourceType::Yelp, &raw, "yelp-456");
        assert!(result.is_ok());

        let transformation = result.unwrap();
        assert_eq!(transformation.source_type, SourceType::Yelp);
        assert_eq!(transformation.raw_id, "yelp-456");
        assert_eq!(transformation.business.name, "Test Yelp Business");
    }

    #[test]
    fn test_transform_facebook() {
        let pipeline = EtlPipeline::new();
        let raw = create_facebook_record();

        let result = pipeline.transform(SourceType::Facebook, &raw, "fb-789");
        assert!(result.is_ok());

        let transformation = result.unwrap();
        assert_eq!(transformation.source_type, SourceType::Facebook);
        assert_eq!(transformation.raw_id, "fb-789");
        assert_eq!(transformation.business.name, "Test Facebook Business");
    }

    #[test]
    fn test_transform_unknown_source() {
        // Unknown source type should fail parsing
        let result = SourceType::from_str("unknown");
        assert!(result.is_err());

        // Can't test transform with unknown source since it fails at type creation
        let _ = result;
    }

    #[test]
    fn test_transform_batch() {
        let pipeline = EtlPipeline::new();
        let records = vec![
            create_google_maps_record(),
            create_google_maps_record(),
            create_google_maps_record(),
        ];

        let results = pipeline.transform_batch(SourceType::GoogleMaps, &records);
        assert!(results.is_ok());

        let results = results.unwrap();
        assert_eq!(results.len(), 3);

        for result in results.iter() {
            assert_eq!(result.source_type, SourceType::GoogleMaps);
            assert_eq!(result.business.name, "Test Google Maps Business");
        }
    }

    #[test]
    fn test_supported_sources() {
        let pipeline = EtlPipeline::new();
        let sources = pipeline.supported_sources();

        assert_eq!(sources.len(), 3);
        assert!(sources.contains(&SourceType::GoogleMaps));
        assert!(sources.contains(&SourceType::Yelp));
        assert!(sources.contains(&SourceType::Facebook));
    }

    #[test]
    fn test_is_source_supported() {
        let pipeline = EtlPipeline::new();

        assert!(pipeline.is_source_supported(&SourceType::GoogleMaps));
        assert!(pipeline.is_source_supported(&SourceType::Yelp));
        assert!(pipeline.is_source_supported(&SourceType::Facebook));
    }

    #[test]
    fn test_transformer_count() {
        let pipeline = EtlPipeline::new();
        assert_eq!(pipeline.transformer_count(), 3);
    }

    #[test]
    fn test_source_type_parsing() {
        assert!(SourceType::from_str("google_maps").is_ok());
        assert_eq!(SourceType::from_str("google_maps").unwrap(), SourceType::GoogleMaps);

        assert!(SourceType::from_str("googlemaps").is_ok());
        assert_eq!(SourceType::from_str("googlemaps").unwrap(), SourceType::GoogleMaps);

        assert!(SourceType::from_str("google").is_ok());
        assert_eq!(SourceType::from_str("google").unwrap(), SourceType::GoogleMaps);

        assert!(SourceType::from_str("yelp").is_ok());
        assert_eq!(SourceType::from_str("yelp").unwrap(), SourceType::Yelp);

        assert!(SourceType::from_str("facebook").is_ok());
        assert_eq!(SourceType::from_str("facebook").unwrap(), SourceType::Facebook);

        assert!(SourceType::from_str("fb").is_ok());
        assert_eq!(SourceType::from_str("fb").unwrap(), SourceType::Facebook);

        assert!(SourceType::from_str("unknown").is_err());
    }

    #[test]
    fn test_source_type_as_str() {
        assert_eq!(SourceType::GoogleMaps.as_str(), "google_maps");
        assert_eq!(SourceType::Yelp.as_str(), "yelp");
        assert_eq!(SourceType::Facebook.as_str(), "facebook");
    }

    #[test]
    fn test_transform_with_missing_required_fields() {
        let pipeline = EtlPipeline::new();
        let raw = serde_json::json!({
            "description": "No name business"
        });

        let result = pipeline.transform(SourceType::GoogleMaps, &raw, "test");
        assert!(result.is_err());
    }

    #[test]
    fn test_batch_with_mixed_valid_invalid() {
        let pipeline = EtlPipeline::new();
        let records = vec![
            create_google_maps_record(), // Valid
            serde_json::json!({}),       // Invalid - missing name
            create_google_maps_record(), // Valid
        ];

        let results = pipeline.transform_batch(SourceType::GoogleMaps, &records);
        assert!(results.is_ok());

        // Should have 2 successful transformations (invalid ones are skipped)
        let results = results.unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_handle_missing_optional_fields() {
        // AC: Handle missing optional fields
        // Given source data has missing optional fields
        let pipeline = EtlPipeline::new();
        let raw = serde_json::json!({
            "displayName": "Test Business with Missing Fields"
            // description, address, phone, website, categories, rating, reviewCount are all missing
        });

        // When the ETL pipeline processes it
        let result = pipeline.transform(SourceType::GoogleMaps, &raw, "test-id");

        // Then the record is still valid
        assert!(result.is_ok());

        let transformation = result.unwrap();
        assert_eq!(transformation.business.name, "Test Business with Missing Fields");

        // And the output has null for missing optional fields
        assert!(transformation.business.description.is_none());
        assert!(transformation.business.address.is_none());
        assert!(transformation.business.phone.is_none());
        assert!(transformation.business.website.is_none());
        assert!(transformation.business.category.is_none());
        assert!(transformation.business.rating.is_none());
        assert!(transformation.business.review_count.is_none());
    }
}
