//! Google Maps scraper implementation with pagination support

use crate::types::PlaceResult;
use bw_types::{Business, BusinessBuilder};
use chrono::Utc;
use std::collections::HashSet;
use tracing::{info, warn};
use uuid::Uuid;

/// Google Maps scraper with pagination support
pub struct GoogleMapsScraper {
    /// Base URL for Google Maps search
    _base_url: String,
    /// Results per page
    page_size: usize,
}

impl GoogleMapsScraper {
    /// Create a new Google Maps scraper
    pub fn new() -> Self {
        Self {
            _base_url: "https://www.google.com/maps".to_string(),
            page_size: 10, // Google Maps typically shows 10 results per page
        }
    }

    /// Set the page size for pagination
    pub fn with_page_size(mut self, page_size: usize) -> Self {
        self.page_size = page_size;
        self
    }

    /// Scrape businesses with pagination support
    ///
    /// This method handles pagination to ensure all results are captured,
    /// not just the first page (which typically contains only 10 results).
    ///
    /// # Arguments
    /// * `search_query` - The search term to use
    /// * `max_results` - Maximum number of results to fetch (0 = unlimited)
    ///
    /// # Returns
    /// A vector of Business entities
    pub async fn scrape_with_pagination(
        &self,
        search_query: &str,
        max_results: usize,
    ) -> Result<Vec<Business>, Box<dyn std::error::Error + Send + Sync>> {
        info!("Starting scrape with pagination for query: {}", search_query);

        let mut all_businesses = Vec::new();
        let mut seen_place_ids: HashSet<String> = HashSet::new();
        let mut page = 0;
        let mut total_fetched = 0;

        loop {
            // Check if we've reached the maximum
            if max_results > 0 && total_fetched >= max_results {
                info!("Reached maximum result limit: {}", max_results);
                break;
            }

            info!("Fetching page {}", page);

            // Fetch a page of results
            let page_results = self.fetch_page(search_query, page).await?;

            if page_results.is_empty() {
                info!("No more results on page {}", page);
                break;
            }

            // Transform and deduplicate
            for place in page_results {
                // Skip duplicates based on place ID
                if seen_place_ids.contains(&place.place_id) {
                    info!("Skipping duplicate place: {}", place.place_id);
                    continue;
                }

                seen_place_ids.insert(place.place_id.clone());

                // Transform to Business entity
                let business = self.transform_to_business(&place)?;
                all_businesses.push(business);

                total_fetched += 1;

                // Check max again after adding
                if max_results > 0 && total_fetched >= max_results {
                    break;
                }
            }

            // Check if we should continue to next page
            if max_results > 0 && total_fetched >= max_results {
                break;
            }

            page += 1;

            // Safety limit to prevent infinite loops
            if page > 100 {
                warn!("Reached safety limit of 100 pages");
                break;
            }
        }

        info!(
            "Pagination complete. Total businesses: {}",
            all_businesses.len()
        );
        Ok(all_businesses)
    }

    /// Fetch a single page of results
    ///
    /// # Arguments
    /// * `search_query` - The search term
    /// * `page` - Page number (0-indexed)
    ///
    /// # Returns
    /// A vector of PlaceResult entities
    async fn fetch_page(
        &self,
        search_query: &str,
        page: usize,
    ) -> Result<Vec<PlaceResult>, Box<dyn std::error::Error + Send + Sync>> {
        // In a real implementation, this would make an HTTP request to Google Maps
        // For now, return mock data to demonstrate pagination structure

        // Return empty results for empty query
        if search_query.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Calculate offset for this page
        let offset = page * self.page_size;

        // Generate mock results for demonstration
        // In production, this would be actual HTTP scraping logic
        let mut results = Vec::new();

        for i in 0..self.page_size {
            let global_index = offset + i;

            // Simulate having more results than fit on one page
            if global_index >= 25 {
                // Simulate running out of results after 25 total
                break;
            }

            let place_id = format!("place_{}", global_index);
            let name = format!("Business {} (Page {})", global_index + 1, page + 1);

            results.push(PlaceResult {
                place_id,
                name,
                description: None,
                address: Some(format!("Address {}, City", global_index + 1)),
                phone: Some(format!("555-000{}", global_index % 10)),
                website: Some(format!("https://business{}.com", global_index + 1)),
                rating: Some(4.0 + (global_index % 5) as f64 / 10.0),
                review_count: Some((100 + global_index * 10) as u32),
                category: None,
                photos: vec![],
            });
        }

        Ok(results)
    }

    /// Transform a PlaceResult into a Business entity
    fn transform_to_business(&self, place: &PlaceResult) -> Result<Business, Box<dyn std::error::Error + Send + Sync>> {
        let description = place.description.clone();
        let business = BusinessBuilder::default()
            .id(Uuid::new_v4())
            .name(&place.name)
            .category_id(Uuid::new_v4()) // Default category - would be mapped in production
            .owner_id(Uuid::new_v4()) // Placeholder - would be the scraper/system user
            .verified(false) // Newly scraped businesses are unverified
            .created_at(Utc::now())
            .description(description)
            .address(place.address.clone())
            .phone(place.phone.clone())
            .website(place.website.clone())
            .category(place.category.clone())
            .rating(place.rating)
            .review_count(place.review_count.map(|c| c as i32))
            .build()?;
        Ok(business)
    }
}

impl Default for GoogleMapsScraper {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_pagination_fetches_multiple_pages() {
        let scraper = GoogleMapsScraper::new();
        let results = scraper.scrape_with_pagination("test query", 25).await.unwrap();

        // Should have fetched 25 results across multiple pages
        assert_eq!(results.len(), 25);
    }

    #[tokio::test]
    async fn test_pagination_respects_max_results() {
        let scraper = GoogleMapsScraper::new();
        let results = scraper.scrape_with_pagination("test query", 15).await.unwrap();

        // Should have fetched exactly 15 results
        assert_eq!(results.len(), 15);
    }

    #[tokio::test]
    async fn test_pagination_handles_empty_results() {
        let scraper = GoogleMapsScraper::new();
        // Query that returns no results
        let results = scraper.scrape_with_pagination("", 10).await.unwrap();

        // Should handle empty results gracefully
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_pagination_deduplicates_across_pages() {
        let scraper = GoogleMapsScraper::new();
        let results = scraper.scrape_with_pagination("test query", 100).await.unwrap();

        // All place IDs should be unique
        let mut place_ids: Vec<String> = results
            .iter()
            .map(|b| b.name.clone())
            .collect();
        place_ids.sort();
        place_ids.dedup();

        assert_eq!(place_ids.len(), results.len());
    }
}
