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
    pub description: Option<String>,
    pub category_id: String,
    pub owner_id: String,
    pub status: String,
    pub verified: bool,
    pub created_at: DateTimeUtc,
    pub rating_avg: Option<f64>,
    pub review_count: i32,
    pub location: Option<String>,
}

impl From<Business> for GQLBusiness {
    fn from(business: Business) -> Self {
        Self {
            id: business.id.to_string(),
            name: business.name,
            description: business.description,
            category_id: business.category_id.to_string(),
            owner_id: business.owner_id.to_string(),
            status: if business.verified { "verified".to_string() } else { "unverified".to_string() },
            verified: business.verified,
            created_at: business.created_at.into(),
            rating_avg: None,
            review_count: 0,
            location: business.location,
        }
    }
}

/// GraphQL Business type with rating aggregation
#[derive(SimpleObject, Clone, Debug)]
pub struct GQLBusinessWithRatings {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category_id: String,
    pub owner_id: String,
    pub status: String,
    pub verified: bool,
    pub created_at: DateTimeUtc,
    pub rating_avg: Option<f64>,
    pub review_count: i32,
}

impl GQLBusinessWithRatings {
    /// Create a new GQLBusinessWithRatings from a Business with rating stats
    pub fn with_ratings(business: Business, rating_avg: Option<f64>, review_count: i64) -> Self {
        Self {
            id: business.id.to_string(),
            name: business.name,
            description: business.description,
            category_id: business.category_id.to_string(),
            owner_id: business.owner_id.to_string(),
            status: if business.verified { "verified".to_string() } else { "unverified".to_string() },
            verified: business.verified,
            created_at: business.created_at.into(),
            rating_avg,
            review_count: review_count as i32,
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

/// Scrape job status enum
#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScrapeJobStatus {
    Success,
    Failed,
    Running,
}

/// Scrape job type for GraphQL
#[derive(SimpleObject, Clone, Debug)]
pub struct ScrapeJob {
    pub id: String,
    pub job_name: String,
    pub target_url: String,
    pub status: ScrapeJobStatus,
    pub error_message: Option<String>,
    pub items_scraped: u32,
    pub started_at: DateTimeUtc,
    pub completed_at: Option<DateTimeUtc>,
}

/// Aggregated scrape job statistics
#[derive(SimpleObject, Clone, Debug)]
pub struct ScrapeJobStats {
    pub total_jobs: i32,
    pub successful_jobs: i32,
    pub failed_jobs: i32,
    pub total_items_scraped: i32,
    pub period_days: i32,
    pub avg_duration_seconds: Option<f64>,
    pub min_duration_seconds: Option<i64>,
    pub max_duration_seconds: Option<i64>,
}
