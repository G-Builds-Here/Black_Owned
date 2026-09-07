//! Core transformer types and utilities for ETL pipeline.

use crate::Business;
use anyhow::{anyhow, Result};
use chrono::Utc;
use uuid::Uuid;

/// Raw data fields that may be present from various sources.
#[derive(Debug, Clone)]
pub struct RawBusinessData {
    pub name: Option<String>,
    pub description: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub category: Option<String>,
    pub rating: Option<f64>,
    pub review_count: Option<u32>,
    pub image_url: Option<String>,
}

impl RawBusinessData {
    pub fn new() -> Self {
        Self {
            name: None,
            description: None,
            address: None,
            phone: None,
            website: None,
            category: None,
            rating: None,
            review_count: None,
            image_url: None,
        }
    }
}

impl Default for RawBusinessData {
    fn default() -> Self {
        Self::new()
    }
}

/// Transform raw business data into a Business entity.
pub fn transform_to_business(
    raw: &RawBusinessData,
    category_id: Uuid,
) -> Result<Business> {
    let name = raw.name.clone().ok_or_else(|| anyhow!("Business name is required"))?;

    if name.trim().is_empty() {
        return Err(anyhow!("Business name cannot be empty"));
    }

    Ok(Business {
        id: Uuid::new_v4(),
        name,
        description: raw.description.clone(),
        category_id,
        owner_id: Uuid::new_v4(), // Placeholder - would come from auth context
        verified: false, // Default to unverified until verified
        created_at: Utc::now(),
        address: raw.address.clone(),
        phone: raw.phone.clone(),
        website: raw.website.clone(),
        category: raw.category.clone(),
        rating: raw.rating,
        review_count: raw.review_count.map(|v| v as i32),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_with_required_fields() {
        let raw = RawBusinessData {
            name: Some("Test Business".to_string()),
            description: Some("A test business".to_string()),
            ..RawBusinessData::new()
        };

        let category_id = Uuid::new_v4();
        let business = transform_to_business(&raw, category_id).unwrap();

        assert_eq!(business.name, "Test Business");
        assert_eq!(business.description, Some("A test business".to_string()));
        assert_eq!(business.category_id, category_id);
        assert!(!business.verified);
    }

    #[test]
    fn test_transform_missing_name() {
        let raw = RawBusinessData::new();
        let category_id = Uuid::new_v4();

        let result = transform_to_business(&raw, category_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_transform_empty_name() {
        let raw = RawBusinessData {
            name: Some("   ".to_string()),
            ..RawBusinessData::new()
        };
        let category_id = Uuid::new_v4();

        let result = transform_to_business(&raw, category_id);
        assert!(result.is_err());
    }
}
