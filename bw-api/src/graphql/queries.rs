//! GraphQL queries for Black Owned API.
//!
//! Provides query resolvers for:
//! - businesses: List businesses with pagination
//! - business: Get a single business by ID
//! - reviews: List reviews for a business
//! - categories: List all categories
//! - search: Search businesses by name

use async_graphql::*;
use bw_types::{Business, Category, Review};
use chrono::Utc;
use uuid::Uuid;

use super::types::{BusinessConnection, BusinessEdge, GQLBusiness, GQLCategory, GQLReview, PageInfo};

/// Query root for GraphQL API
pub struct QueryRoot;

#[Object]
impl QueryRoot {
    /// Get all businesses with cursor-based pagination
    async fn businesses(
        &self,
        ctx: &Context<'_>,
        first: Option<i32>,
        after: Option<String>,
    ) -> Result<BusinessConnection> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let limit = first.unwrap_or(10).min(100) as u64;
        let after_cursor = after.as_ref().map(|c| c.parse::<i64>().unwrap_or(0));

        let query = r#"
            SELECT id, name, category_id, verified, created_at
            FROM businesses
            WHERE ($1 IS NULL OR id > $1)
            ORDER BY id
            LIMIT $2
        "#;

        let rows = sqlx::query_as::<_, (Uuid, String, Uuid, bool, chrono::DateTime<Utc>)>(query)
            .bind(after_cursor)
            .bind(limit as i64)
            .fetch_all(db)
            .await
            .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        let has_next_page = rows.len() > limit as usize;
        let rows = if has_next_page {
            rows[..rows.len() - 1].to_vec()
        } else {
            rows
        };

        let edges: Vec<_> = rows
            .into_iter()
            .map(|(id, name, category_id, verified, created_at)| {
                let business = Business {
                    id,
                    name,
                    category_id,
                    verified,
                    created_at,
                };
                let cursor = id.to_string();
                let node = GQLBusiness::from(business);
                BusinessEdge { cursor, node }
            })
            .collect();

        let start_cursor = edges.first().map(|e| e.cursor.clone());
        let end_cursor = edges.last().map(|e| e.cursor.clone());

        Ok(BusinessConnection {
            edges,
            page_info: PageInfo {
                has_next_page,
                has_previous_page: after.is_some(),
                start_cursor,
                end_cursor,
            },
        })
    }

    /// Get a single business by ID
    async fn business(&self, ctx: &Context<'_>, id: String) -> Result<Option<GQLBusiness>> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let business_id = Uuid::parse_str(&id).map_err(|e| {
            Error::new(format!("Invalid UUID: {:?}", e))
        })?;

        let row = sqlx::query_as::<_, (Uuid, String, Uuid, bool, chrono::DateTime<Utc>)>(
            "SELECT id, name, category_id, verified, created_at FROM businesses WHERE id = $1",
        )
        .bind(business_id)
        .fetch_optional(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(row.map(|(bid, name, category_id, verified, created_at)| {
            GQLBusiness::from(Business {
                id: bid,
                name,
                category_id,
                verified,
                created_at,
            })
        }))
    }

    /// Get reviews for a business
    async fn reviews(
        &self,
        ctx: &Context<'_>,
        business_id: String,
    ) -> Result<Vec<GQLReview>> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let business_uuid = Uuid::parse_str(&business_id).map_err(|e| {
            Error::new(format!("Invalid UUID: {:?}", e))
        })?;

        let rows = sqlx::query_as::<_, (Uuid, Uuid, Uuid, i8, String, chrono::DateTime<Utc>)>(
            "SELECT id, business_id, user_id, rating, comment, created_at FROM reviews WHERE business_id = $1",
        )
        .bind(business_uuid)
        .fetch_all(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(rows
            .into_iter()
            .map(|(id, bid, uid, rating, comment, created_at)| {
                GQLReview::from(Review {
                    id,
                    business_id: bid,
                    user_id: uid,
                    rating: rating as u8,
                    comment,
                    created_at,
                })
            })
            .collect())
    }

    /// Get all categories
    async fn categories(&self, ctx: &Context<'_>) -> Result<Vec<GQLCategory>> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let rows =
            sqlx::query_as::<_, (Uuid, String, String)>("SELECT id, name, description FROM categories")
                .fetch_all(db)
                .await
                .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(rows
            .into_iter()
            .map(|(id, name, description)| GQLCategory::from(Category { id, name, description }))
            .collect())
    }

    /// Search businesses by name
    async fn search(&self, ctx: &Context<'_>, query: String) -> Result<Vec<GQLBusiness>> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let search_pattern = format!("%{}%", query);

        let rows = sqlx::query_as::<_, (Uuid, String, Uuid, bool, chrono::DateTime<Utc>)>(
            "SELECT id, name, category_id, verified, created_at FROM businesses WHERE name ILIKE $1",
        )
        .bind(search_pattern)
        .fetch_all(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(rows
            .into_iter()
            .map(|(id, name, category_id, verified, created_at)| {
                GQLBusiness::from(Business {
                    id,
                    name,
                    category_id,
                    verified,
                    created_at,
                })
            })
            .collect())
    }
}
