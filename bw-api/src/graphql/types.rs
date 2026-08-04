//! GraphQL types for Black Owned API.
//!
//! Provides GraphQL type definitions for Business, Review, Category, and User.

use async_graphql::*;
use bw_types::{Business, Category, Review, User};
use chrono::{DateTime, Utc};

/// GraphQL wrapper for DateTime
#[derive(SimpleObject, Clone, Debug)]
pub struct DateTimeUtc {
    pub timestamp: i64,
}

impl From<DateTime<Utc>> for DateTimeUtc {
    fn from(dt: DateTime<Utc>) -> Self {
        Self {
            timestamp: dt.timestamp(),
        }
    }
}

/// GraphQL Business type
#[derive(SimpleObject, Clone, Debug)]
pub struct GQLBusiness {
    pub id: String,
    pub name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub category: Option<String>,
    pub rating: Option<f64>,
    pub review_count: Option<i32>,
}

impl From<Business> for GQLBusiness {
    fn from(business: Business) -> Self {
        Self {
            id: business.id.to_string(),
            name: business.name,
            address: business.address,
            phone: business.phone,
            website: business.website,
            category: business.category,
            rating: business.rating,
            review_count: business.review_count.map(|c| c as i32),
        }
    }
}

/// GraphQL Review type
#[derive(SimpleObject, Clone, Debug)]
pub struct GQLReview {
    pub id: String,
    pub business_id: String,
    pub user_id: String,
    pub rating: i32,
    pub comment: String,
    pub created_at: DateTimeUtc,
}

/// Return type for submitReview mutation containing the review and updated business
#[derive(SimpleObject, Clone, Debug)]
pub struct SubmitReviewResult {
    pub review: GQLReview,
    pub business: GQLBusiness,
}

impl From<Review> for GQLReview {
    fn from(review: Review) -> Self {
        Self {
            id: review.id.to_string(),
            business_id: review.business_id.to_string(),
            user_id: review.user_id.to_string(),
            rating: review.rating as i32,
            comment: review.comment,
            created_at: review.created_at.into(),
        }
    }
}

/// GraphQL Category type
#[derive(SimpleObject, Clone, Debug)]
pub struct GQLCategory {
    pub id: String,
    pub name: String,
    pub description: String,
}

impl From<Category> for GQLCategory {
    fn from(category: Category) -> Self {
        Self {
            id: category.id.to_string(),
            name: category.name,
            description: category.description,
        }
    }
}

/// GraphQL User type
#[derive(SimpleObject, Clone, Debug)]
pub struct GQLUser {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub created_at: DateTimeUtc,
}

impl From<User> for GQLUser {
    fn from(user: User) -> Self {
        Self {
            id: user.id.to_string(),
            email: user.email,
            display_name: user.display_name,
            created_at: user.created_at.into(),
        }
    }
}

/// Cursor-based pagination connection for businesses
#[derive(SimpleObject, Clone, Debug)]
pub struct BusinessConnection {
    pub edges: Vec<BusinessEdge>,
    pub page_info: PageInfo,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct BusinessEdge {
    pub cursor: String,
    pub node: GQLBusiness,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct PageInfo {
    pub has_next_page: bool,
    pub has_previous_page: bool,
    pub start_cursor: Option<String>,
    pub end_cursor: Option<String>,
}
