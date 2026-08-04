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
        address: Option<String>,
        phone: Option<String>,
        website: Option<String>,
        category: Option<String>,
    ) -> Result<GQLBusiness> {
        // Validate name is required
        if name.trim().is_empty() {
            return Err(Error::new("Name is required"));
        }

        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let id = Uuid::new_v4();

        let result = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<f64>, Option<i64>)>(
            r#"
            INSERT INTO businesses (id, name, address, phone, website, category, rating, review_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, name, address, phone, website, category, rating, review_count
            "#,
        )
        .bind(id)
        .bind(&name)
        .bind(&address)
        .bind(&phone)
        .bind(&website)
        .bind(&category)
        .bind(None::<f64>)
        .bind(None::<i64>)
        .fetch_one(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(GQLBusiness::from(Business {
            id: result.0,
            name: result.1,
            address: result.2,
            phone: result.3,
            website: result.4,
            category: result.5,
            rating: result.6,
            review_count: result.7.map(|c| c as u32),
        }))
    }

    /// Update an existing business
    async fn update_business(
        &self,
        ctx: &Context<'_>,
        id: String,
        name: Option<String>,
        address: Option<String>,
        phone: Option<String>,
        website: Option<String>,
        category: Option<String>,
    ) -> Result<Option<GQLBusiness>> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let business_id = Uuid::parse_str(&id).map_err(|e| {
            Error::new(format!("Invalid business UUID: {:?}", e))
        })?;

        let row = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<f64>, Option<i64>)>(
            r#"
            UPDATE businesses
            SET name = COALESCE($2, name),
                address = COALESCE($3, address),
                phone = COALESCE($4, phone),
                website = COALESCE($5, website),
                category = COALESCE($6, category)
            WHERE id = $1
            RETURNING id, name, address, phone, website, category, rating, review_count
            "#,
        )
        .bind(business_id)
        .bind(name.as_deref())
        .bind(address.as_deref())
        .bind(phone.as_deref())
        .bind(website.as_deref())
        .bind(category.as_deref())
        .fetch_optional(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(row.map(|(bid, n, a, p, w, c, r, rc)| {
            GQLBusiness::from(Business {
                id: bid,
                name: n,
                address: a,
                phone: p,
                website: w,
                category: c,
                rating: r,
                review_count: rc.map(|c| c as u32),
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
        let business_row = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<f64>, Option<i64>)>(
            "SELECT id, name, address, phone, website, category, rating, review_count FROM businesses WHERE id = $1",
        )
        .bind(business_uuid)
        .fetch_one(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        let business = Business {
            id: business_row.0,
            name: business_row.1,
            address: business_row.2,
            phone: business_row.3,
            website: business_row.4,
            category: business_row.5,
            rating: business_row.6,
            review_count: business_row.7.map(|c| c as u32),
        };

        let mut gql_business: GQLBusiness = business.into();
        gql_business.rating = rating_avg;
        gql_business.review_count = Some(review_count);

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
