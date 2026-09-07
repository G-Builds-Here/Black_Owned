//! GraphQL mutation tests for review submission and rating aggregation.

use async_graphql::{EmptySubscription, Request, Schema};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

use super::mutations::MutationRoot;
use super::queries::QueryRoot;

/// Create a test database pool from environment or defaults
async fn create_test_pool() -> sqlx::PgPool {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/black_owned_test".to_string());

    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&database_url)
        .await
        .expect("Failed to create database pool")
}

/// Setup test database schema
///
/// Statements are executed individually: PostgreSQL rejects multiple
/// commands in a single prepared statement (error 42601).
///
/// DDL is serialized with a session advisory lock: concurrent
/// `CREATE TABLE IF NOT EXISTS` from parallel test backends can race on
/// the `pg_type` catalog index and fail with a duplicate key error.
async fn setup_test_schema(pool: &sqlx::PgPool) {
    sqlx::query("SELECT pg_advisory_lock(42424242)")
        .execute(pool)
        .await
        .expect("Failed to acquire schema DDL lock");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS businesses (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            category_id UUID NOT NULL,
            owner_id UUID NOT NULL,
            verified BOOLEAN DEFAULT false,
            address TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("Failed to create test schema");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS reviews (
            id UUID PRIMARY KEY,
            business_id UUID NOT NULL REFERENCES businesses(id),
            user_id UUID NOT NULL,
            rating SMALLINT NOT NULL,
            comment TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(business_id, user_id)
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("Failed to create test schema");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS categories (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("Failed to create test schema");

    sqlx::query("SELECT pg_advisory_unlock(42424242)")
        .execute(pool)
        .await
        .expect("Failed to release schema DDL lock");
}

/// Create a test schema with database connection
async fn create_test_schema() -> Schema<QueryRoot, MutationRoot, EmptySubscription> {
    let pool = create_test_pool().await;
    setup_test_schema(&pool).await;

    Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(pool)
        .finish()
}

/// Create a test schema with a given authenticated user
async fn create_test_schema_as(user_id: &Uuid) -> Schema<QueryRoot, MutationRoot, EmptySubscription> {
    let pool = create_test_pool().await;
    setup_test_schema(&pool).await;

    Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(pool)
        .data(crate::middleware::UserId(user_id.to_string()))
        .finish()
}

#[tokio::test]
async fn test_submit_review_success() {
    let schema = create_test_schema().await;

    // Create a business first
    let business_id = Uuid::new_v4();
    let category_id = Uuid::new_v4();

    sqlx::query("INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)")
        .bind(category_id)
        .bind("Test Category")
        .bind("Test Description")
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    sqlx::query("INSERT INTO businesses (id, name, category_id, owner_id) VALUES ($1, $2, $3, $4)")
        .bind(business_id)
        .bind("Test Business")
        .bind(category_id)
        .bind(Uuid::new_v4())
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    let user_id = Uuid::new_v4();
    let request = Request::new(
        format!(
            r#"
            mutation {{
                submitReview(businessId: "{business_id}", userId: "{user_id}", rating: 5, comment: "Great business!") {{
                    review {{
                        id
                        businessId
                        userId
                        rating
                        comment
                    }}
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "GraphQL errors: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let review = data.get("submitReview").unwrap().get("review").unwrap();

    assert_eq!(review.get("rating").unwrap(), 5);
    assert_eq!(review.get("comment").unwrap(), "Great business!");
}

#[tokio::test]
async fn test_submit_review_duplicate_rejected() {
    let schema = create_test_schema().await;

    // Create a business first
    let business_id = Uuid::new_v4();
    let category_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)")
        .bind(category_id)
        .bind("Test Category")
        .bind("Test Description")
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    sqlx::query("INSERT INTO businesses (id, name, category_id, owner_id) VALUES ($1, $2, $3, $4)")
        .bind(business_id)
        .bind("Test Business")
        .bind(category_id)
        .bind(Uuid::new_v4())
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    // Submit first review
    let request = Request::new(
        format!(
            r#"
            mutation {{
                submitReview(businessId: "{business_id}", userId: "{user_id}", rating: 5, comment: "First review") {{
                    review {{
                        id
                        rating
                        comment
                    }}
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;
    assert!(response.errors.is_empty(), "First review should succeed: {:?}", response.errors);

    // Submit duplicate review (same user, same business)
    let request2 = Request::new(
        format!(
            r#"
            mutation {{
                submitReview(businessId: "{business_id}", userId: "{user_id}", rating: 5, comment: "First review") {{
                    review {{
                        id
                        rating
                        comment
                    }}
                }}
            }}
            "#
        ),
    );
    let response = schema.execute(request2).await;

    // Should fail due to duplicate
    assert!(!response.errors.is_empty(), "Duplicate review should be rejected");
}

#[tokio::test]
async fn test_rating_aggregation() {
    let schema = create_test_schema().await;

    // Create a business
    let business_id = Uuid::new_v4();
    let category_id = Uuid::new_v4();

    sqlx::query("INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)")
        .bind(category_id)
        .bind("Test Category")
        .bind("Test Description")
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    sqlx::query("INSERT INTO businesses (id, name, category_id, owner_id) VALUES ($1, $2, $3, $4)")
        .bind(business_id)
        .bind("Test Business")
        .bind(category_id)
        .bind(Uuid::new_v4())
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    // Submit multiple reviews with different ratings
    let ratings = vec![3, 4, 5, 2, 4];
    for (i, rating) in ratings.iter().enumerate() {
        let user_id = Uuid::new_v4();
        let request = Request::new(
            format!(
                r#"
                mutation {{
                    submitReview(businessId: "{business_id}", userId: "{user_id}", rating: {}, comment: "Review") {{
                        review {{
                            id
                            rating
                        }}
                    }}
                }}
                "#,
                rating
            ),
        );

        let response = schema.execute(request).await;
        assert!(response.errors.is_empty(), "Review {} should succeed: {:?}", i, response.errors);
    }

    // Query for business and verify rating aggregation
    let request = Request::new(
        format!(
            r#"
            query {{
                business(id: "{business_id}") {{
                    id
                    name
                    ratingAvg
                    reviewCount
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;
    assert!(response.errors.is_empty(), "Query should succeed: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let business = data.get("business").unwrap();

    // Expected average: (3 + 4 + 5 + 2 + 4) / 5 = 3.6
    let expected_avg = 3.6;
    let actual_avg: f64 = business.get("ratingAvg").unwrap().as_f64().unwrap();
    assert!((actual_avg - expected_avg).abs() < 0.01, "Expected avg ~{}, got {}", expected_avg, actual_avg);

    let review_count: i32 = business.get("reviewCount").unwrap().as_i64().unwrap() as i32;
    assert_eq!(review_count, 5, "Expected 5 reviews");
}

#[tokio::test]
async fn test_submit_review_invalid_rating() {
    let schema = create_test_schema().await;

    let business_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                submitReview(businessId: "{business_id}", userId: "{user_id}", rating: 6, comment: "Invalid") {{
                    id
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    // Should fail because rating is out of range
    assert!(!response.errors.is_empty(), "Rating 6 should be rejected");
}

#[tokio::test]
async fn test_business_rating_avg_none_when_no_reviews() {
    let schema = create_test_schema().await;

    // Create a business without reviews
    let business_id = Uuid::new_v4();
    let category_id = Uuid::new_v4();

    sqlx::query("INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)")
        .bind(category_id)
        .bind("Test Category")
        .bind("Test Description")
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    sqlx::query("INSERT INTO businesses (id, name, category_id, owner_id) VALUES ($1, $2, $3, $4)")
        .bind(business_id)
        .bind("Test Business")
        .bind(category_id)
        .bind(Uuid::new_v4())
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    let request = Request::new(
        format!(
            r#"
            query {{
                business(id: "{business_id}") {{
                    id
                    name
                    ratingAvg
                    reviewCount
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;
    assert!(response.errors.is_empty(), "Query should succeed: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let business = data.get("business").unwrap();

    // Should be null when no reviews
    assert!(business.get("ratingAvg").unwrap().is_null(), "ratingAvg should be null with no reviews");

    let review_count: i32 = business.get("reviewCount").unwrap().as_i64().unwrap() as i32;
    assert_eq!(review_count, 0, "Expected 0 reviews");
}

#[tokio::test]
async fn test_update_business_owner_success() {
    let business_id = Uuid::new_v4();
    let category_id = Uuid::new_v4();
    let owner_id = Uuid::new_v4();
    let schema = create_test_schema_as(&owner_id).await;

    sqlx::query("INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)")
        .bind(category_id)
        .bind("Test Category")
        .bind("Test Description")
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    sqlx::query("INSERT INTO businesses (id, name, category_id, owner_id) VALUES ($1, $2, $3, $4)")
        .bind(business_id)
        .bind("Original Name")
        .bind(category_id)
        .bind(owner_id)
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                updateBusiness(id: "{business_id}", name: "Updated Name", categoryId: "{category_id}", verified: true) {{
                    id
                    name
                    categoryId
                    verified
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "Update by owner should succeed: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let business = data.get("updateBusiness").unwrap();

    assert_eq!(business.get("name").unwrap(), "Updated Name");
    assert_eq!(business.get("categoryId").unwrap().as_str().unwrap(), category_id.to_string());
    assert_eq!(business.get("verified").unwrap(), true);
}

#[tokio::test]
async fn test_update_business_not_owner_rejected() {
    let business_id = Uuid::new_v4();
    let category_id = Uuid::new_v4();
    let owner_id = Uuid::new_v4();
    let non_owner_id = Uuid::new_v4();
    let schema = create_test_schema_as(&non_owner_id).await;

    sqlx::query("INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)")
        .bind(category_id)
        .bind("Test Category")
        .bind("Test Description")
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    sqlx::query("INSERT INTO businesses (id, name, category_id, owner_id) VALUES ($1, $2, $3, $4)")
        .bind(business_id)
        .bind("Original Name")
        .bind(category_id)
        .bind(owner_id)
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    // Note: The mutation extracts user ID from JWT token, not from arguments
    // This test verifies that a non-owner cannot update the business
    let request = Request::new(
        format!(
            r#"
            mutation {{
                updateBusiness(id: "{business_id}", name: "Hacked Name") {{
                    id
                    name
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    // Should fail because the authenticated user (non_owner_id) is not the owner
    assert!(!response.errors.is_empty(), "Update by non-owner should be rejected");
}

#[tokio::test]
async fn test_update_business_not_found_returns_null() {
    let caller_id = Uuid::new_v4();
    let schema = create_test_schema_as(&caller_id).await;

    let non_existent_id = Uuid::new_v4();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                updateBusiness(id: "{non_existent_id}", verified: false) {{
                    id
                    name
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "Query should succeed: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let business = data.get("updateBusiness").unwrap();

    assert!(business.is_null(), "Should return null for non-existent business");
}

#[tokio::test]
async fn test_update_business_partial_fields() {
    let business_id = Uuid::new_v4();
    let category_id = Uuid::new_v4();
    let owner_id = Uuid::new_v4();
    let schema = create_test_schema_as(&owner_id).await;

    sqlx::query("INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)")
        .bind(category_id)
        .bind("Test Category")
        .bind("Test Description")
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    sqlx::query("INSERT INTO businesses (id, name, category_id, owner_id) VALUES ($1, $2, $3, $4)")
        .bind(business_id)
        .bind("Original Name")
        .bind(category_id)
        .bind(owner_id)
        .execute(schema.data::<sqlx::PgPool>().unwrap())
        .await
        .unwrap();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                updateBusiness(id: "{business_id}", verified: true) {{
                    id
                    name
                    verified
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "Partial update should succeed: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let business = data.get("updateBusiness").unwrap();

    assert_eq!(business.get("name").unwrap(), "Original Name", "Name should remain unchanged");
    assert_eq!(business.get("verified").unwrap(), true);
}
