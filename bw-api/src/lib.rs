//! API module for Black Owned platform.

use bw_types::{Business, Category, Review};
use serde::{Deserialize, Serialize};

pub mod routes;

/// API response wrapper
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    /// Create a successful response
    #[must_use]
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    /// Create an error response
    #[must_use]
    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// Business API handler
pub struct BusinessApi;

impl BusinessApi {
    /// Get a business by ID
    ///
    /// Returns None if the business is not found.
    #[must_use]
    pub fn get_business(_id: &uuid::Uuid) -> Option<Business> {
        // Placeholder - would query database in real implementation
        None
    }

    /// Create a new business
    ///
    /// # Errors
    ///
    /// Returns an error if the business name is empty.
    pub fn create_business(
        name: &str,
        category_id: &uuid::Uuid,
    ) -> Result<Business, String> {
        if name.is_empty() {
            return Err("Business name is required".to_string());
        }

        Ok(Business {
            id: uuid::Uuid::new_v4(),
            name: name.to_string(),
            category_id: *category_id,
            verified: false,
            created_at: chrono::Utc::now(),
        })
    }

    /// List all businesses (placeholder)
    #[must_use]
    pub fn list_businesses() -> Vec<Business> {
        Vec::new()
    }
}

/// Category API handler
pub struct CategoryApi;

impl CategoryApi {
    /// Get a category by ID
    #[must_use]
    pub fn get_category(_id: &uuid::Uuid) -> Option<Category> {
        None
    }

    /// List all categories (placeholder)
    #[must_use]
    pub fn list_categories() -> Vec<Category> {
        Vec::new()
    }
}

/// Review API handler
pub struct ReviewApi;

impl ReviewApi {
    /// Create a review
    ///
    /// # Errors
    ///
    /// Returns an error if the rating is not between 1 and 5, or if the comment is empty.
    pub fn create_review(
        business_id: &uuid::Uuid,
        user_id: &uuid::Uuid,
        rating: u8,
        comment: &str,
    ) -> Result<Review, String> {
        if rating == 0 || rating > 5 {
            return Err("Rating must be between 1 and 5".to_string());
        }

        if comment.is_empty() {
            return Err("Comment is required".to_string());
        }

        Ok(Review {
            id: uuid::Uuid::new_v4(),
            business_id: *business_id,
            user_id: *user_id,
            rating,
            comment: comment.to_string(),
            created_at: chrono::Utc::now(),
        })
    }

    /// Get reviews for a business
    #[must_use]
    pub fn get_reviews_for_business(_business_id: &uuid::Uuid) -> Vec<Review> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_response_success() {
        let response = ApiResponse::<String>::success("data".to_string());
        assert!(response.success);
        assert_eq!(response.data, Some("data".to_string()));
        assert!(response.error.is_none());
    }

    #[test]
    fn test_api_response_error() {
        let response = ApiResponse::<String>::error("error".to_string());
        assert!(!response.success);
        assert!(response.data.is_none());
        assert_eq!(response.error, Some("error".to_string()));
    }

    #[test]
    fn test_create_business_valid() {
        let category_id = uuid::Uuid::new_v4();
        let result = BusinessApi::create_business("Test Business", &category_id);

        assert!(result.is_ok());
        let business = result.unwrap();
        assert_eq!(business.name, "Test Business");
        assert_eq!(business.category_id, category_id);
    }

    #[test]
    fn test_create_business_empty_name() {
        let category_id = uuid::Uuid::new_v4();
        let result = BusinessApi::create_business("", &category_id);

        assert!(result.is_err());
    }

    #[test]
    fn test_create_review_valid() {
        let business_id = uuid::Uuid::new_v4();
        let user_id = uuid::Uuid::new_v4();
        let result = ReviewApi::create_review(&business_id, &user_id, 5, "Great!");

        assert!(result.is_ok());
        let review = result.unwrap();
        assert_eq!(review.rating, 5);
        assert_eq!(review.comment, "Great!");
    }

    #[test]
    fn test_create_review_invalid_rating() {
        let business_id = uuid::Uuid::new_v4();
        let user_id = uuid::Uuid::new_v4();
        let result = ReviewApi::create_review(&business_id, &user_id, 0, "Test");

        assert!(result.is_err());
    }

    #[test]
    fn test_create_review_empty_comment() {
        let business_id = uuid::Uuid::new_v4();
        let user_id = uuid::Uuid::new_v4();
        let result = ReviewApi::create_review(&business_id, &user_id, 5, "");

        assert!(result.is_err());
    }
}
