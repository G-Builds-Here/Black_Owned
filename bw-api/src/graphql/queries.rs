//! GraphQL queries for Black Owned API.
//!
//! Provides query resolvers for:
//! - businesses: List businesses with pagination
//! - business: Get a single business by ID
//! - reviews: List reviews for a business
//! - categories: List all categories
//! - search: Search businesses by name
//! - scrapeJobStats: Get aggregated scrape job statistics
//! - scrapeJobs: List scrape jobs with optional filtering

use async_graphql::*;
use bw_types::{Business, Category, Review};
use chrono::Utc;
use uuid::Uuid;

use super::types::{BusinessConnection, BusinessEdge, GQLBusiness, GQLCategory, GQLReview, PageInfo, ScrapeJob, ScrapeJobStats, ScrapeJobStatus};

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
                    description: None,
                    category_id,
                    owner_id: Uuid::nil(),
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

        let Some((bid, name, category_id, verified, created_at)) = row else {
            return Ok(None);
        };

        let business = Business {
            id: bid,
            name,
            description: None,
            category_id,
            owner_id: Uuid::nil(),
            verified,
            created_at,
        };

        Ok(Some(GQLBusiness::from(business)))
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
                    description: None,
                    category_id,
                    owner_id: Uuid::nil(),
                    verified,
                    created_at,
                })
            })
            .collect())
    }

    /// Get scrape job statistics for the last N days (default 30)
    async fn scrape_job_stats(
        &self,
        ctx: &Context<'_>,
        days: Option<i32>,
    ) -> Result<ScrapeJobStats> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let period_days = days.unwrap_or(30);
        let since = Utc::now() - chrono::Duration::days(period_days as i64);

        // Query for aggregated stats from PostgreSQL scrape_jobs table
        let row = sqlx::query_as::<_, (i64, i64, i64, i64)>(
            r#"
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'success') as successful,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COALESCE(SUM(items_scraped), 0) as total_items
            FROM scrape_jobs
            WHERE started_at >= $1
            "#,
        )
        .bind(since)
        .fetch_one(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(ScrapeJobStats {
            total_jobs: row.0 as i32,
            successful_jobs: row.1 as i32,
            failed_jobs: row.2 as i32,
            total_items_scraped: row.3 as i32,
            period_days,
        })
    }

    /// Get list of scrape jobs with optional status filter
    async fn scrape_jobs(
        &self,
        ctx: &Context<'_>,
        status_filter: Option<ScrapeJobStatus>,
        limit: Option<i32>,
    ) -> Result<Vec<ScrapeJob>> {
        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let limit_val = limit.unwrap_or(50).min(100);

        let query = if let Some(status) = status_filter {
            format!(
                "SELECT id, job_name, target_url, status, error_message, items_scraped, started_at, completed_at FROM scrape_jobs WHERE status = '{}' ORDER BY started_at DESC LIMIT {}",
                match status {
                    ScrapeJobStatus::Success => "success",
                    ScrapeJobStatus::Failed => "failed",
                    ScrapeJobStatus::Running => "running",
                },
                limit_val
            )
        } else {
            format!(
                "SELECT id, job_name, target_url, status, error_message, items_scraped, started_at, completed_at FROM scrape_jobs ORDER BY started_at DESC LIMIT {}",
                limit_val
            )
        };

        let rows = sqlx::query_as::<_, (Uuid, String, String, String, Option<String>, i32, chrono::DateTime<Utc>, Option<chrono::DateTime<Utc>>)>(
            &query
        )
        .fetch_all(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(rows
            .into_iter()
            .map(|(id, job_name, target_url, status, error_message, items_scraped, started_at, completed_at)| {
                let status_enum = match status.as_str() {
                    "success" => ScrapeJobStatus::Success,
                    "failed" => ScrapeJobStatus::Failed,
                    _ => ScrapeJobStatus::Running,
                };
                ScrapeJob {
                    id: id.to_string(),
                    job_name,
                    target_url,
                    status: status_enum,
                    error_message,
                    items_scraped: items_scraped as u32,
                    started_at: started_at.into(),
                    completed_at: completed_at.map(|dt| dt.into()),
                }
            })
            .collect())
    }
}
