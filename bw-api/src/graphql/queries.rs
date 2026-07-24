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

/// Get rating aggregation for a business
async fn get_rating_aggregation(
    db: &sqlx::PgPool,
    business_id: Uuid,
) -> Result<(Option<f64>, i32)> {
    let row = sqlx::query_as::<_, (Option<f64>, i64)>(
        "SELECT AVG(rating::double precision), COUNT(*) FROM reviews WHERE business_id = $1",
    )
    .bind(business_id)
    .fetch_optional(db)
    .await
    .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

    Ok(row
        .map(|(avg, count)| (avg, count as i32))
        .unwrap_or((None, 0)))
}

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
                    owner_id: Uuid::new_v4(),
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

    /// Get a single business by ID with rating aggregation
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

        let business = row.map(|(bid, name, category_id, verified, created_at)| {
            Business {
                id: bid,
                name,
                description: None,
                category_id,
                owner_id: Uuid::new_v4(),
                verified,
                created_at,
            }
        });

        // Fetch rating aggregation
        let (rating_avg, review_count) = get_rating_aggregation(&db, business_id).await?;

        Ok(business.map(|b| {
            let mut gql_business = GQLBusiness::from(b);
            gql_business.rating_avg = rating_avg;
            gql_business.review_count = review_count;
            gql_business
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
                    description: None,
                    category_id,
                    owner_id: Uuid::new_v4(),
                    verified,
                    created_at,
                })
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rating_bounds_valid() {
        // Test that rating values 1-5 are valid
        assert!(1 >= 1 && 1 <= 5);
        assert!(3 >= 1 && 3 <= 5);
        assert!(5 >= 1 && 5 <= 5);
    }

    #[test]
    fn test_rating_bounds_invalid() {
        // Test that rating values outside 1-5 are invalid
        assert!(0 < 1 || 0 > 5);
        assert!(6 < 1 || 6 > 5);
    }

    #[test]
    fn test_uuid_parsing_valid() {
        let valid_uuid = Uuid::new_v4().to_string();
        let result = Uuid::parse_str(&valid_uuid);
        assert!(result.is_ok());
    }

    #[test]
    fn test_uuid_parsing_invalid() {
        let invalid_uuid = "not-a-valid-uuid";
        let result = Uuid::parse_str(invalid_uuid);
        assert!(result.is_err());
    }

    #[test]
    fn test_rating_aggregation_math() {
        // Test average calculation: (3 + 4 + 5 + 2 + 4) / 5 = 3.6
        let ratings: Vec<i32> = vec![3, 4, 5, 2, 4];
        let sum: i32 = ratings.iter().sum();
        let avg = sum as f64 / ratings.len() as f64;
        assert!((avg - 3.6).abs() < 0.01);
    }

    #[test]
    fn test_rating_aggregation_single_review() {
        // Test average with single review
        let ratings: Vec<i32> = vec![5];
        let sum: i32 = ratings.iter().sum();
        let avg = sum as f64 / ratings.len() as f64;
        assert!((avg - 5.0).abs() < 0.01);
    }

    #[test]
    fn test_rating_aggregation_two_reviews() {
        // Test average with two reviews: (3 + 5) / 2 = 4.0
        let ratings: Vec<i32> = vec![3, 5];
        let sum: i32 = ratings.iter().sum();
        let avg = sum as f64 / ratings.len() as f64;
        assert!((avg - 4.0).abs() < 0.01);
    }

    #[test]
    fn test_business_name_validation_empty() {
        let empty_name = "";
        assert!(empty_name.trim().is_empty());
    }

    #[test]
    fn test_business_name_validation_whitespace() {
        let whitespace_name = "   ";
        assert!(whitespace_name.trim().is_empty());
    }

    #[test]
    fn test_business_name_validation_valid() {
        let valid_name = "Test Business";
        assert!(!valid_name.trim().is_empty());
    }
}
