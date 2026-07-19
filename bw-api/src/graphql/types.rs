//! GraphQL type definitions for domain entities.

use async_graphql::*;
use bw_types::{Business as DomainBusiness, Category as DomainCategory, Review as DomainReview, User as DomainUser};

/// Business entity representing a black-owned business
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "Business")]
pub struct Business {
    /// Unique identifier for the business
    pub id: String,
    /// Business name
    pub name: String,
    /// Category identifier
    pub category_id: String,
    /// Verification status
    pub verified: bool,
    /// Creation timestamp
    pub created_at: String,
}

impl From<DomainBusiness> for Business {
    fn from(business: DomainBusiness) -> Self {
        Self {
            id: business.id.to_string(),
            name: business.name,
            category_id: business.category_id.to_string(),
            verified: business.verified,
            created_at: business.created_at.to_rfc3339(),
        }
    }
}

/// Review entity for business reviews
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "Review")]
pub struct Review {
    /// Unique identifier for the review
    pub id: String,
    /// Business identifier
    pub business_id: String,
    /// User identifier
    pub user_id: String,
    /// Rating from 1 to 5
    pub rating: i32,
    /// Review comment
    pub comment: String,
    /// Creation timestamp
    pub created_at: String,
}

impl From<DomainReview> for Review {
    fn from(review: DomainReview) -> Self {
        Self {
            id: review.id.to_string(),
            business_id: review.business_id.to_string(),
            user_id: review.user_id.to_string(),
            rating: review.rating as i32,
            comment: review.comment,
            created_at: review.created_at.to_rfc3339(),
        }
    }
}

/// Category entity for business categories
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "Category")]
pub struct Category {
    /// Unique identifier for the category
    pub id: String,
    /// Category name
    pub name: String,
    /// Category description
    pub description: String,
}

impl From<DomainCategory> for Category {
    fn from(category: DomainCategory) -> Self {
        Self {
            id: category.id.to_string(),
            name: category.name,
            description: category.description,
        }
    }
}

/// User entity for platform users
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "User")]
pub struct User {
    /// Unique identifier for the user
    pub id: String,
    /// User email address
    pub email: String,
    /// Display name
    pub display_name: String,
    /// Creation timestamp
    pub created_at: String,
}

impl From<DomainUser> for User {
    fn from(user: DomainUser) -> Self {
        Self {
            id: user.id.to_string(),
            email: user.email,
            display_name: user.display_name,
            created_at: user.created_at.to_rfc3339(),
        }
    }
}

/// Input type for creating a business
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CreateBusinessInput")]
pub struct CreateBusinessInput {
    /// Business name
    pub name: String,
    /// Category identifier
    pub category_id: String,
}

/// Input type for updating a business
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateBusinessInput")]
pub struct UpdateBusinessInput {
    /// Business identifier
    pub id: String,
    /// Business name (optional)
    pub name: Option<String>,
    /// Category identifier (optional)
    pub category_id: Option<String>,
    /// Verification status (optional)
    pub verified: Option<bool>,
}

/// Input type for submitting a review
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "SubmitReviewInput")]
pub struct SubmitReviewInput {
    /// Business identifier
    pub business_id: String,
    /// User identifier
    pub user_id: String,
    /// Rating from 1 to 5
    pub rating: i32,
    /// Review comment
    pub comment: String,
}

/// Input type for cursor-based pagination
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "BusinessConnectionInput")]
pub struct BusinessConnectionInput {
    /// First N results
    #[graphql(default = 10)]
    pub first: i32,
    /// Cursor for forward pagination
    pub after: Option<String>,
}

/// Cursor-based connection for businesses
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "BusinessConnection")]
pub struct BusinessConnection {
    /// List of edges
    pub edges: Vec<BusinessEdge>,
    /// Pagination info
    pub page_info: PageInfo,
}

/// Edge containing a business and cursor
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "BusinessEdge")]
pub struct BusinessEdge {
    /// Cursor for this edge
    pub cursor: String,
    /// Business node
    pub node: Business,
}

/// Pagination information
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "PageInfo")]
pub struct PageInfo {
    /// Whether there are more results
    pub has_next_page: bool,
    /// Whether there are previous results
    pub has_previous_page: bool,
    /// Cursor for the first item
    pub start_cursor: Option<String>,
    /// Cursor for the last item
    pub end_cursor: Option<String>,
}
