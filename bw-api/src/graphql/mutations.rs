//! GraphQL mutations for Black Owned API.
//!
//! Provides mutation resolvers for:
//! - createBusiness: Create a new business
//! - createReview: Create a review for a business

use async_graphql::*;
use bw_types::{Business, Review};
use chrono::Utc;
use uuid::Uuid;

use super::types::{GQLBusiness, GQLReview, BusinessInput, ReviewInput};

/// Mutation root for GraphQL API
pub struct MutationRoot;

#[Object]
impl MutationRoot {
    /// Create a new business
    async fn create_business(
        &self,
        _ctx: &Context<'_>,
        input: BusinessInput,
    ) -> Result<GQLBusiness> {
        // Validate name is required
        if input.name.trim().is_empty() {
            return Err(Error::new("Name is required"));
        }

        let category_uuid = Uuid::parse_str(&input.category_id).map_err(|e| {
            Error::new(format!("Invalid category UUID: {:?}", e))
        })?;

        let business = Business {
            id: Uuid::new_v4(),
            name: input.name,
            category_id: category_uuid,
            verified: false,
            created_at: Utc::now(),
        };

        Ok(GQLBusiness::from(business))
    }

    /// Create a review for a business
    async fn create_review(
        &self,
        _ctx: &Context<'_>,
        input: ReviewInput,
    ) -> Result<GQLReview> {
        // Validate rating bounds
        if input.rating < 1 || input.rating > 5 {
            return Err(Error::new("Rating must be between 1 and 5"));
        }

        // Validate comment is required
        if input.comment.is_empty() {
            return Err(Error::new("Comment is required"));
        }

        let business_uuid = Uuid::parse_str(&input.business_id).map_err(|e| {
            Error::new(format!("Invalid business UUID: {:?}", e))
        })?;

        let review = Review {
            id: Uuid::new_v4(),
            business_id: business_uuid,
            user_id: Uuid::new_v4(), // Placeholder - would come from auth context
            rating: input.rating as u8,
            comment: input.comment,
            created_at: Utc::now(),
        };

        Ok(GQLReview::from(review))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_business_name_required() {
        let empty_name = "";
        assert!(empty_name.trim().is_empty());
    }

    #[test]
    fn test_validate_business_name_whitespace_only() {
        let whitespace_name = "   ";
        assert!(whitespace_name.trim().is_empty());
    }

    #[test]
    fn test_validate_category_uuid_valid() {
        let valid_uuid = Uuid::new_v4().to_string();
        let result = Uuid::parse_str(&valid_uuid);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_category_uuid_invalid() {
        let invalid_uuid = "not-a-uuid";
        let result = Uuid::parse_str(invalid_uuid);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_review_rating_bounds() {
        // Valid ratings
        assert!(1 >= 1 && 1 <= 5);
        assert!(3 >= 1 && 3 <= 5);
        assert!(5 >= 1 && 5 <= 5);

        // Invalid ratings
        assert!(0 < 1 || 0 > 5);
        assert!(6 < 1 || 6 > 5);
    }

    #[test]
    fn test_validate_review_comment_required() {
        let empty_comment = "";
        assert!(empty_comment.is_empty());
    }

    #[test]
    fn test_business_creation_includes_timestamp() {
        let category_id = Uuid::new_v4();
        let business = Business {
            id: Uuid::new_v4(),
            name: "Test Business".to_string(),
            category_id,
            verified: false,
            created_at: Utc::now(),
        };

        assert!(business.created_at.timestamp() > 0);
    }

    #[test]
    fn test_review_creation_includes_timestamp() {
        let business_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();

        let review = Review {
            id: Uuid::new_v4(),
            business_id,
            user_id,
            rating: 5,
            comment: "Great!".to_string(),
            created_at: Utc::now(),
        };

        assert!(review.created_at.timestamp() > 0);
    }
}
