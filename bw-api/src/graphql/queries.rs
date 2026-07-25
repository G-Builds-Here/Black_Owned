//! GraphQL queries for Black Owned API.
//!
//! Provides query resolvers for:
//! - businesses: List businesses with pagination
//! - business: Get a single business by ID

use async_graphql::*;

use super::types::{BusinessConnection, GQLBusiness, GQLCategory, GQLReview, PageInfo};

/// Query root for GraphQL API
pub struct QueryRoot;

#[Object]
impl QueryRoot {
    /// Get all businesses with cursor-based pagination
    async fn businesses(
        &self,
        _ctx: &Context<'_>,
        first: Option<i32>,
        after: Option<String>,
    ) -> Result<BusinessConnection> {
        let _limit = first.unwrap_or(10).min(100) as usize;
        let _after_cursor = after.as_ref().map(|c| c.parse::<i64>().unwrap_or(0));

        // Placeholder: return empty connection
        // In a real implementation, this would query the database
        let has_next_page = false;

        Ok(BusinessConnection {
            edges: Vec::new(),
            page_info: PageInfo {
                has_next_page,
                has_previous_page: after.is_some(),
                start_cursor: None,
                end_cursor: None,
            },
        })
    }

    /// Get a single business by ID
    async fn business(&self, _ctx: &Context<'_>, id: String) -> Result<Option<GQLBusiness>> {
        let _business_id = uuid::Uuid::parse_str(&id).map_err(|e| {
            Error::new(format!("Invalid UUID: {:?}", e))
        })?;

        // Placeholder: return None
        // In a real implementation, this would query the database
        Ok(None)
    }

    /// Get reviews for a business
    async fn reviews(
        &self,
        _ctx: &Context<'_>,
        business_id: String,
    ) -> Result<Vec<GQLReview>> {
        let _business_uuid = uuid::Uuid::parse_str(&business_id).map_err(|e| {
            Error::new(format!("Invalid UUID: {:?}", e))
        })?;

        // Placeholder: return empty vector
        // In a real implementation, this would query the database
        Ok(Vec::new())
    }

    /// Get all categories
    async fn categories(&self, _ctx: &Context<'_>) -> Result<Vec<GQLCategory>> {
        // Placeholder: return empty vector
        // In a real implementation, this would query the database
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_uuid_parsing_valid() {
        let valid_uuid = uuid::Uuid::new_v4().to_string();
        let result = uuid::Uuid::parse_str(&valid_uuid);
        assert!(result.is_ok());
    }

    #[test]
    fn test_uuid_parsing_invalid() {
        let invalid_uuid = "not-a-valid-uuid";
        let result = uuid::Uuid::parse_str(invalid_uuid);
        assert!(result.is_err());
    }

    #[test]
    fn test_pagination_limits() {
        // Test that first parameter is bounded
        let limit: i32 = 150;
        let bounded = limit.min(100);
        assert_eq!(bounded, 100);
    }

    #[test]
    fn test_default_pagination() {
        // Test default first value
        let first: Option<i32> = None;
        let limit = first.unwrap_or(10);
        assert_eq!(limit, 10);
    }
}
