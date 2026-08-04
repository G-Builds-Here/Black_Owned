//! Type definitions for the scraper module

use serde::{Deserialize, Serialize};

/// Represents a single place result from Google Maps
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceResult {
    /// Unique identifier for the place
    pub place_id: String,
    /// Business name
    pub name: String,
    /// Optional description
    pub description: Option<String>,
    /// Formatted address
    pub address: Option<String>,
    /// Phone number
    pub phone: Option<String>,
    /// Website URL
    pub website: Option<String>,
    /// Business rating (1-5)
    pub rating: Option<f64>,
    /// Number of reviews
    pub review_count: Option<u32>,
    /// Primary category
    pub category: Option<String>,
    /// Photo URLs
    pub photos: Vec<String>,
}

/// Response from Google Maps API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleMapsResponse {
    /// List of place results
    pub results: Vec<PlaceResult>,
    /// Token for fetching the next page (if available)
    pub next_page_token: Option<String>,
    /// Status of the request
    pub status: String,
}

/// Pagination state for tracking multi-page scrapes
#[derive(Debug, Clone)]
pub struct PaginationState {
    /// Current page number
    pub current_page: usize,
    /// Total results fetched so far
    pub total_fetched: usize,
    /// Whether there are more pages available
    pub has_more: bool,
    /// Next page token (if using token-based pagination)
    pub next_token: Option<String>,
}

impl PaginationState {
    /// Create a new pagination state
    pub fn new() -> Self {
        Self {
            current_page: 0,
            total_fetched: 0,
            has_more: true,
            next_token: None,
        }
    }

    /// Mark that we're moving to the next page
    pub fn next_page(&mut self) {
        self.current_page += 1;
    }

    /// Update the total count after fetching a page
    pub fn add_results(&mut self, count: usize) {
        self.total_fetched += count;
    }

    /// Mark that there are no more pages
    pub fn set_no_more(&mut self) {
        self.has_more = false;
    }
}

impl Default for PaginationState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pagination_state_initial() {
        let state = PaginationState::new();
        assert_eq!(state.current_page, 0);
        assert_eq!(state.total_fetched, 0);
        assert!(state.has_more);
    }

    #[test]
    fn test_pagination_state_next_page() {
        let mut state = PaginationState::new();
        state.next_page();
        assert_eq!(state.current_page, 1);
    }

    #[test]
    fn test_pagination_state_add_results() {
        let mut state = PaginationState::new();
        state.add_results(10);
        assert_eq!(state.total_fetched, 10);
        state.add_results(5);
        assert_eq!(state.total_fetched, 15);
    }

    #[test]
    fn test_place_result_serialization() {
        let place = PlaceResult {
            place_id: "test_123".to_string(),
            name: "Test Business".to_string(),
            description: Some("A test business".to_string()),
            address: Some("123 Test St".to_string()),
            phone: Some("555-1234".to_string()),
            website: Some("https://test.com".to_string()),
            rating: Some(4.5),
            review_count: Some(100),
            category: Some("Restaurant".to_string()),
            photos: vec!["photo1.jpg".to_string(), "photo2.jpg".to_string()],
        };

        let json = serde_json::to_string(&place).unwrap();
        let deserialized: PlaceResult = serde_json::from_str(&json).unwrap();

        assert_eq!(place.place_id, deserialized.place_id);
        assert_eq!(place.name, deserialized.name);
        assert_eq!(place.rating, deserialized.rating);
    }
}
