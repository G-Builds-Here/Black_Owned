//! GraphQL mutation resolvers.

use async_graphql::*;
use crate::graphql::types::{Business, CreateBusinessInput, Review, SubmitReviewInput, UpdateBusinessInput};
use bw_types::{Business as DomainBusiness, Review as DomainReview};
use uuid::Uuid;

/// Mutation root for GraphQL operations
#[derive(Default)]
pub struct Mutation;

#[Object]
impl Mutation {
    /// Create a new business
    async fn create_business(&self, input: CreateBusinessInput) -> Result<Business> {
        let category_id = Uuid::parse_str(&input.category_id)
            .map_err(|e| format!("Invalid category ID: {}", e))?;

        let business = DomainBusiness {
            id: Uuid::new_v4(),
            name: input.name,
            category_id,
            verified: false,
            created_at: chrono::Utc::now(),
        };

        Ok(Business::from(business))
    }

    /// Update an existing business
    async fn update_business(&self, input: UpdateBusinessInput) -> Result<Business> {
        let id = Uuid::parse_str(&input.id)
            .map_err(|e| format!("Invalid business ID: {}", e))?;

        let category_id = match input.category_id {
            Some(ref cat_id) => {
                Some(Uuid::parse_str(cat_id)
                    .map_err(|e| format!("Invalid category ID: {}", e))?)
            }
            None => None,
        };

        // In a real implementation, this would fetch and update from the database
        // For now, create a placeholder business
        let business = DomainBusiness {
            id,
            name: input.name.unwrap_or_else(|| "Unknown".to_string()),
            category_id: category_id.unwrap_or_else(Uuid::new_v4),
            verified: input.verified.unwrap_or(false),
            created_at: chrono::Utc::now(),
        };

        Ok(Business::from(business))
    }

    /// Submit a review for a business
    async fn submit_review(&self, input: SubmitReviewInput) -> Result<Review> {
        let business_id = Uuid::parse_str(&input.business_id)
            .map_err(|e| format!("Invalid business ID: {}", e))?;

        let user_id = Uuid::parse_str(&input.user_id)
            .map_err(|e| format!("Invalid user ID: {}", e))?;

        if input.rating < 1 || input.rating > 5 {
            return Err("Rating must be between 1 and 5".into());
        }

        if input.comment.is_empty() {
            return Err("Comment is required".into());
        }

        let review = DomainReview {
            id: Uuid::new_v4(),
            business_id,
            user_id,
            rating: input.rating as u8,
            comment: input.comment,
            created_at: chrono::Utc::now(),
        };

        Ok(Review::from(review))
    }

    /// Delete a review
    async fn delete_review(&self, id: String) -> Result<bool> {
        let _ = Uuid::parse_str(&id)
            .map_err(|e| format!("Invalid review ID: {}", e))?;

        // In a real implementation, this would delete from the database
        // For now, just return success
        Ok(true)
    }
}
