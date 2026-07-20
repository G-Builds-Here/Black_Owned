//! GraphQL mutations for Black Owned API.
//!
//! Provides mutation resolvers for:
//! - createBusiness: Create a new business
//! - updateBusiness: Update an existing business
//! - submitReview: Submit a review for a business
//! - deleteReview: Delete a review

use async_graphql::*;
use bw_types::{Business, Review};
use chrono::Utc;
use uuid::Uuid;

use super::types::{GQLBusiness, GQLReview, SubmitReviewResult};
use crate::middleware::UserId;

/// Mutation root for GraphQL API
pub struct MutationRoot;

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

#[Object]
impl MutationRoot {
    /// Create a new business
    async fn create_business(
        &self,
        ctx: &Context<'_>,
        name: String,
        description: Option<String>,
        category_id: String,
    ) -> Result<GQLBusiness> {
        // Validate name is required
        if name.trim().is_empty() {
            return Err(Error::new("Name is required"));
        }

        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        // Extract user ID from JWT token
        let user_id = ctx
            .data::<UserId>()
            .map(|uid| uid.0.clone())
            .ok_or_else(|| Error::new("Unauthorized: User not authenticated"))?;

        let user_uuid = Uuid::parse_str(&user_id).map_err(|e| {
            Error::new(format!("Invalid user ID from token: {:?}", e))
        })?;

        let category_uuid = Uuid::parse_str(&category_id).map_err(|e| {
            Error::new(format!("Invalid category UUID: {:?}", e))
        })?;

        let id = Uuid::new_v4();

        let result = sqlx::query_as::<_, (Uuid, String, Option<String>, Uuid, Uuid, bool, chrono::DateTime<Utc>)>(
            r#"
            INSERT INTO businesses (id, name, description, category_id, owner_id, verified, created_at)
            VALUES ($1, $2, $3, $4, $5, false, $6)
            RETURNING id, name, description, category_id, owner_id, verified, created_at
            "#,
        )
        .bind(id)
        .bind(&name)
        .bind(&description)
        .bind(category_uuid)
        .bind(user_uuid)
        .bind(Utc::now())
        .fetch_one(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(GQLBusiness::from(Business {
            id: result.0,
            name: result.1,
            description: result.2,
            category_id: result.3,
            owner_id: result.4,
            verified: result.5,
            created_at: result.6,
        }))
    }

    /// Update an existing business
    async fn update_business(
        &self,
        ctx: &Context<'_>,
        id: String,
        name: Option<String>,
        category_id: Option<String>,
        verified: Option<bool>,
    ) -> Result<Option<GQLBusiness>> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        // Extract user ID from JWT token
        let user_id = ctx
            .data::<UserId>()
            .map(|uid| uid.0.clone())
            .ok_or_else(|| Error::new("Unauthorized: User not authenticated"))?;

        let user_uuid = Uuid::parse_str(&user_id).map_err(|e| {
            Error::new(format!("Invalid user ID from token: {:?}", e))
        })?;

        let business_id = Uuid::parse_str(&id).map_err(|e| {
            Error::new(format!("Invalid business UUID: {:?}", e))
        })?;

        let name_ref = name.as_deref();
        let category_uuid = category_id
            .map(|s| Uuid::parse_str(&s))
            .transpose()
            .map_err(|e| Error::new(format!("Invalid category UUID: {:?}", e)))?;

        // First, check if the business exists and get its owner
        let current_owner = sqlx::query_as::<_, (Uuid,)>(
            "SELECT owner_id FROM businesses WHERE id = $1",
        )
        .bind(business_id)
        .fetch_optional(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        match current_owner {
            Some((owner_id,)) => {
                // Verify the user is the owner
                if owner_id != user_uuid {
                    return Err(Error::new("Forbidden: You are not the owner of this business"));
                }
            }
            None => {
                return Ok(None);
            }
        }

        let row = sqlx::query_as::<_, (Uuid, String, Uuid, bool, chrono::DateTime<Utc>, Uuid)>(
            r#"
            UPDATE businesses
            SET name = COALESCE($2, name),
                category_id = COALESCE($3, category_id),
                verified = COALESCE($4, verified)
            WHERE id = $1
            RETURNING id, name, category_id, verified, created_at, owner_id
            "#,
        )
        .bind(business_id)
        .bind(name_ref)
        .bind(category_uuid)
        .bind(verified)
        .fetch_optional(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(row.map(|(bid, n, cid, v, ca, oid)| {
            GQLBusiness::from(Business {
                id: bid,
                name: n,
                category_id: cid,
                verified: v,
                created_at: ca,
                owner_id: oid,
            })
        }))
    }

    /// Submit a review for a business
    ///
    /// Checks for duplicate reviews (same user + same business) and rejects duplicates.
    /// Returns the created review with updated rating aggregation.
    async fn submit_review(
        &self,
        ctx: &Context<'_>,
        business_id: String,
        user_id: String,
        rating: i32,
        comment: String,
    ) -> Result<SubmitReviewResult> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        if rating < 1 || rating > 5 {
            return Err(Error::new("Rating must be between 1 and 5"));
        }

        let business_uuid = Uuid::parse_str(&business_id).map_err(|e| {
            Error::new(format!("Invalid business UUID: {:?}", e))
        })?;

        let user_uuid = Uuid::parse_str(&user_id).map_err(|e| {
            Error::new(format!("Invalid user UUID: {:?}", e))
        })?;

        // Check for duplicate review (same user + same business)
        let existing = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM reviews WHERE business_id = $1 AND user_id = $2)",
        )
        .bind(business_uuid)
        .bind(user_uuid)
        .fetch_one(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        if existing {
            return Err(Error::new("A review for this business by this user already exists"));
        }
        }

        let id = Uuid::new_v4();

        let result =
            sqlx::query_as::<_, (Uuid, Uuid, Uuid, i8, String, chrono::DateTime<Utc>)>(
                r#"
                INSERT INTO reviews (id, business_id, user_id, rating, comment, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, business_id, user_id, rating, comment, created_at
                "#,
            )
            .bind(id)
            .bind(business_uuid)
            .bind(user_uuid)
            .bind(rating as i8)
            .bind(&comment)
            .bind(Utc::now())
            .fetch_one(db)
            .await
            .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        let review = Review {
            id: result.0,
            business_id: result.1,
            user_id: result.2,
            rating: result.3 as u8,
            comment: result.4,
            created_at: result.5,
        };

        // Calculate rating average and review count
        let (sum, count) = sqlx::query_as::<_, (i64, i64)>(
            "SELECT COALESCE(SUM(rating), 0), COUNT(*) FROM reviews WHERE business_id = $1",
        )
        .bind(business_uuid)
        .fetch_one(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        let rating_avg = if count > 0 {
            Some(sum as f64 / count as f64)
        } else {
            None
        };
        let review_count = count as i32;

        // Fetch business details
        let business_row = sqlx::query_as::<_, (Uuid, String, Uuid, bool, chrono::DateTime<Utc>, Uuid)>(
            "SELECT id, name, category_id, verified, created_at, owner_id FROM businesses WHERE id = $1",
        )
        .bind(business_uuid)
        .fetch_one(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        let business = Business {
            id: business_row.0,
            name: business_row.1,
            category_id: business_row.2,
            verified: business_row.3,
            created_at: business_row.4,
            owner_id: business_row.5,
        };

        let mut gql_business: GQLBusiness = business.into();
        gql_business.rating_avg = rating_avg;
        gql_business.review_count = review_count;

        Ok(SubmitReviewResult {
            review: GQLReview::from(review),
            business: gql_business,
        })
    }

    /// Delete a review
    async fn delete_review(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let review_id = Uuid::parse_str(&id).map_err(|e| {
            Error::new(format!("Invalid review UUID: {:?}", e))
        })?;

        let result = sqlx::query("DELETE FROM reviews WHERE id = $1")
            .bind(review_id)
            .execute(db)
            .await
            .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(result.rows_affected() > 0)
    }
}
