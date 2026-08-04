//! GraphQL schema definition for Black Owned API.
//!
//! Provides types and operations for Business, Review, Category, and User entities.

use async_graphql::*;
use bw_types::{Business, Category, Review, User};
use chrono::DateTime;
use uuid::Uuid;

/// Cursor for pagination
#[derive(SimpleObject, Clone, Debug)]
pub struct Cursor {
    pub value: String,
}

/// Page info for cursor-based pagination
#[derive(SimpleObject, Clone, Debug)]
pub struct PageInfo {
    pub has_next_page: bool,
    pub has_previous_page: bool,
    pub start_cursor: Option<String>,
    pub end_cursor: Option<String>,
}

/// Connection wrapper for paginated business lists
#[derive(SimpleObject, Clone, Debug)]
pub struct BusinessConnection {
    pub edges: Vec<BusinessEdge>,
    pub page_info: PageInfo,
}

/// Edge wrapper for business items in pagination
#[derive(SimpleObject, Clone, Debug)]
pub struct BusinessEdge {
    pub cursor: String,
    pub node: Business,
}

/// GraphQL Business type
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "Business")]
pub struct GqlBusiness {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category_id: String,
    pub owner_id: String,
    pub status: String,
    pub verified: bool,
    pub created_at: DateTime<Utc>,
}

impl From<Business> for GqlBusiness {
    fn from(business: Business) -> Self {
        Self {
            id: business.id.to_string(),
            name: business.name,
            description: business.description,
            category_id: business.category_id.to_string(),
            owner_id: business.owner_id.to_string(),
            status: if business.verified { "verified".to_string() } else { "unverified".to_string() },
            verified: business.verified,
            created_at: business.created_at,
        }
    }
}

/// GraphQL Review type
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "Review")]
pub struct GqlReview {
    pub id: String,
    pub business_id: String,
    pub user_id: String,
    pub rating: i32,
    pub comment: String,
    pub created_at: DateTime<Utc>,
}

impl From<Review> for GqlReview {
    fn from(review: Review) -> Self {
        Self {
            id: review.id.to_string(),
            business_id: review.business_id.to_string(),
            user_id: review.user_id.to_string(),
            rating: review.rating as i32,
            comment: review.comment,
            created_at: review.created_at,
        }
    }
}

/// GraphQL Category type
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "Category")]
pub struct GqlCategory {
    pub id: String,
    pub name: String,
    pub description: String,
}

impl From<Category> for GqlCategory {
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
#[graphql(name = "User")]
pub struct GqlUser {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
}

impl From<User> for GqlUser {
    fn from(user: User) -> Self {
        Self {
            id: user.id.to_string(),
            email: user.email,
            display_name: user.display_name,
            created_at: user.created_at,
        }
    }
}

/// Input type for creating a business
#[derive(InputObject, Clone, Debug)]
pub struct CreateBusinessInput {
    pub name: String,
    pub description: Option<String>,
    pub category_id: String,
}

/// Input type for updating a business
#[derive(InputObject, Clone, Debug)]
pub struct UpdateBusinessInput {
    pub id: String,
    pub name: Option<String>,
    pub category_id: Option<String>,
    pub verified: Option<bool>,
}

/// Input type for submitting a review
#[derive(InputObject, Clone, Debug)]
pub struct SubmitReviewInput {
    pub business_id: String,
    pub user_id: String,
    pub rating: i32,
    pub comment: String,
}

/// Input type for deleting a review
#[derive(InputObject, Clone, Debug)]
pub struct DeleteReviewInput {
    pub id: String,
}

/// Query root for GraphQL
#[derive(Default)]
pub struct QueryRoot;

#[Object]
impl QueryRoot {
    /// Get all businesses with cursor-based pagination
    async fn businesses(
        &self,
        first: Option<i32>,
        after: Option<String>,
    ) -> BusinessConnection {
        // Placeholder: would query database in real implementation
        let businesses: Vec<Business> = Vec::new();

        let edges: Vec<BusinessEdge> = businesses
            .into_iter()
            .enumerate()
            .map(|(i, b)| BusinessEdge {
                cursor: format!("cursor-{}", i),
                node: b,
            })
            .collect();

        let has_next = edges.len() > first.unwrap_or(10) as usize;
        let has_prev = after.is_some();

        BusinessConnection {
            edges,
            page_info: PageInfo {
                has_next_page: has_next,
                has_previous_page: has_prev,
                start_cursor: edges.first().map(|e| e.cursor.clone()),
                end_cursor: edges.last().map(|e| e.cursor.clone()),
            },
        }
    }

    /// Get a business by ID
    async fn business(&self, id: String) -> Option<GqlBusiness> {
        let uuid = Uuid::parse_str(&id).ok()?;
        // Placeholder: would query database in real implementation
        let _business: Option<Business> = None;
        None
    }

    /// Get all reviews
    async fn reviews(&self) -> Vec<GqlReview> {
        // Placeholder: would query database in real implementation
        Vec::new()
    }

    /// Get all categories
    async fn categories(&self) -> Vec<GqlCategory> {
        // Placeholder: would query database in real implementation
        Vec::new()
    }

    /// Search businesses by name or category
    async fn search(&self, query: String) -> Vec<GqlBusiness> {
        // Placeholder: would search database in real implementation
        let _query_lower = query.to_lowercase();
        Vec::new()
    }
}

/// Extract user ID from JWT token in Authorization header
fn extract_user_from_auth(ctx: &Context<'_>) -> Result<Uuid> {
    let auth_header = ctx
        .data::<axum::Extension<axum::headers::Authorization<axum::headers::Bearer>>>()
        .map(|ext| ext.0.token().to_string())
        .or_else(|| {
            ctx.req()
                .headers()
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|h| h.to_str().ok())
                .filter(|s| s.starts_with("Bearer "))
                .map(|s| s.trim_start_matches("Bearer ").to_string())
        });

    auth_header
        .ok_or_else(|| Error::new("Authorization header is required"))
        .and_then(|token| {
            Uuid::parse_str(&token).map_err(|e| Error::new(format!("Invalid user token: {:?}", e)))
        })
}

/// Mutation root for GraphQL
#[derive(Default)]
pub struct MutationRoot;

#[Object]
impl MutationRoot {
    /// Create a new business
    async fn create_business(&self, ctx: &Context<'_>, input: CreateBusinessInput) -> Result<GqlBusiness> {
        // Validate name is required
        if input.name.trim().is_empty() {
            return Err("Name is required".into());
        }

        let category_id = Uuid::parse_str(&input.category_id)
            .map_err(|_| "Invalid category ID format")?;

        // Extract user ID from auth context
        let owner_id = extract_user_from_auth(ctx)?;

        let business = Business {
            id: Uuid::new_v4(),
            name: input.name,
            description: input.description,
            category_id,
            owner_id,
            verified: false,
            created_at: chrono::Utc::now(),
            address: None,
            phone: None,
            website: None,
            category: None,
            rating: None,
            review_count: None,
        };

        Ok(business.into())
    }

    /// Update an existing business
    async fn update_business(&self, input: UpdateBusinessInput) -> Result<GqlBusiness> {
        let _business_id = Uuid::parse_str(&input.id)
            .map_err(|_| "Invalid business ID format")?;

        // Placeholder: would update database in real implementation
        // For now, return an error indicating not implemented
        Err("Business update not yet implemented".into())
    }

    /// Submit a review for a business
    async fn submit_review(&self, input: SubmitReviewInput) -> Result<GqlReview> {
        if input.rating < 1 || input.rating > 5 {
            return Err("Rating must be between 1 and 5".into());
        }

        if input.comment.is_empty() {
            return Err("Comment is required".into());
        }

        let business_id = Uuid::parse_str(&input.business_id)
            .map_err(|_| "Invalid business ID format")?;
        let user_id = Uuid::parse_str(&input.user_id)
            .map_err(|_| "Invalid user ID format")?;

        let review = Review {
            id: Uuid::new_v4(),
            business_id,
            user_id,
            rating: input.rating as u8,
            comment: input.comment,
            created_at: chrono::Utc::now(),
        };

        Ok(review.into())
    }

    /// Delete a review
    async fn delete_review(&self, input: DeleteReviewInput) -> Result<bool> {
        let _review_id = Uuid::parse_str(&input.id)
            .map_err(|_| "Invalid review ID format")?;

        // Placeholder: would delete from database in real implementation
        Ok(true)
    }
}

/// Create the GraphQL schema
pub fn create_schema() -> Schema<QueryRoot, MutationRoot, EmptySubscription> {
    Schema::new(QueryRoot, MutationRoot, EmptySubscription)
}
