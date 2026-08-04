//! Black Owned Scraper - Google Maps web scraper with pagination support
//!
//! This module implements a scraper that:
//! - Fetches business results from Google Maps
//! - Handles pagination to capture all results (not just first 10)
//! - Prevents duplicate business capture
//! - Transforms raw data into normalized Business entities

mod scraper;
mod types;

use scraper::GoogleMapsScraper;
use std::collections::HashSet;
use tracing::{info, Level};
use bw_types::Business;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    info!("Starting Black Owned Scraper");

    // Example: scrape businesses with pagination
    let search_query = "black owned businesses";
    let scraper = GoogleMapsScraper::new();

    // Run the scraper with pagination
    let businesses = scraper.scrape_with_pagination(search_query, 100).await?;

    info!("Successfully scraped {} businesses", businesses.len());

    // Deduplicate by name (in production, would use more sophisticated matching)
    let unique_businesses = deduplicate_businesses(businesses);
    info!("After deduplication: {} unique businesses", unique_businesses.len());

    Ok(())
}

/// Remove duplicate businesses based on name matching
fn deduplicate_businesses(businesses: Vec<Business>) -> Vec<Business> {
    let mut seen_names: HashSet<String> = HashSet::new();
    let mut result = Vec::new();

    for business in businesses {
        let name_lower = business.name.to_lowercase();
        if !seen_names.contains(&name_lower) {
            seen_names.insert(name_lower);
            result.push(business);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use bw_types::BusinessBuilder;
    use uuid::Uuid;
    use chrono::Utc;

    #[test]
    fn test_deduplication() {
        let businesses = vec![
            BusinessBuilder::default()
                .id(Uuid::new_v4())
                .name("Test Business")
                .description("Test description".to_string())
                .category_id(Uuid::new_v4())
                .owner_id(Uuid::new_v4())
                .verified(false)
                .created_at(Utc::now())
                .build()
                .unwrap(),
            BusinessBuilder::default()
                .id(Uuid::new_v4())
                .name("TEST BUSINESS")
                .description("Test description".to_string())
                .category_id(Uuid::new_v4())
                .owner_id(Uuid::new_v4())
                .verified(false)
                .created_at(Utc::now())
                .build()
                .unwrap(),
            BusinessBuilder::default()
                .id(Uuid::new_v4())
                .name("Different Business")
                .description("Different description".to_string())
                .category_id(Uuid::new_v4())
                .owner_id(Uuid::new_v4())
                .verified(false)
                .created_at(Utc::now())
                .build()
                .unwrap(),
        ];

        let unique = deduplicate_businesses(businesses);
        assert_eq!(unique.len(), 2);
    }
}
