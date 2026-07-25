//! GraphQL integration tests for Black Owned API.

use async_graphql::Request;

use super::schema::create_schema;

#[tokio::test]
async fn test_create_business_success() {
    let schema = create_schema();

    let request = Request::new(
        r#"
        mutation {
            createBusiness(input: { name: "Test Business", categoryId: "550e8400-e29b-41d4-a716-446655440000" }) {
                id
                name
                categoryId
                verified
            }
        }
        "#,
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "GraphQL errors: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let business = data.get("createBusiness").unwrap();

    assert_eq!(business.get("name").unwrap(), "Test Business");
    assert_eq!(business.get("verified").unwrap(), false);
}

#[tokio::test]
async fn test_create_business_empty_name_fails() {
    let schema = create_schema();

    let request = Request::new(
        r#"
        mutation {
            createBusiness(input: { name: "", categoryId: "550e8400-e29b-41d4-a716-446655440000" }) {
                id
            }
        }
        "#,
    );

    let response = schema.execute(request).await;

    assert!(!response.errors.is_empty(), "Empty name should be rejected");
}

#[tokio::test]
async fn test_create_business_invalid_category_id() {
    let schema = create_schema();

    let request = Request::new(
        r#"
        mutation {
            createBusiness(input: { name: "Test", categoryId: "invalid-uuid" }) {
                id
            }
        }
        "#,
    );

    let response = schema.execute(request).await;

    assert!(!response.errors.is_empty(), "Invalid UUID should be rejected");
}

#[tokio::test]
async fn test_create_review_success() {
    let schema = create_schema();

    let business_id = uuid::Uuid::new_v4().to_string();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                createReview(input: {{ businessId: "{business_id}", rating: 5, comment: "Great business!" }}) {{
                    id
                    businessId
                    rating
                    comment
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "GraphQL errors: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let review = data.get("createReview").unwrap();

    assert_eq!(review.get("rating").unwrap(), 5);
    assert_eq!(review.get("comment").unwrap(), "Great business!");
}

#[tokio::test]
async fn test_create_review_invalid_rating() {
    let schema = create_schema();

    let business_id = uuid::Uuid::new_v4().to_string();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                createReview(input: {{ businessId: "{business_id}", rating: 6, comment: "Test" }}) {{
                    id
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(!response.errors.is_empty(), "Rating 6 should be rejected");
}

#[tokio::test]
async fn test_create_review_rating_zero() {
    let schema = create_schema();

    let business_id = uuid::Uuid::new_v4().to_string();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                createReview(input: {{ businessId: "{business_id}", rating: 0, comment: "Test" }}) {{
                    id
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(!response.errors.is_empty(), "Rating 0 should be rejected");
}

#[tokio::test]
async fn test_create_review_empty_comment() {
    let schema = create_schema();

    let business_id = uuid::Uuid::new_v4().to_string();

    let request = Request::new(
        format!(
            r#"
            mutation {{
                createReview(input: {{ businessId: "{business_id}", rating: 5, comment: "" }}) {{
                    id
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(!response.errors.is_empty(), "Empty comment should be rejected");
}

#[tokio::test]
async fn test_businesses_query_returns_empty() {
    let schema = create_schema();

    let request = Request::new(
        r#"
        query {
            businesses(first: 10) {
                edges {
                    cursor
                    node {
                        id
                        name
                    }
                }
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                }
            }
        }
        "#,
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "GraphQL errors: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let businesses = data.get("businesses").unwrap();

    let edges = businesses.get("edges").unwrap().as_array().unwrap();
    assert!(edges.is_empty(), "Should return empty edges");
}

#[tokio::test]
async fn test_business_query_returns_none() {
    let schema = create_schema();

    let business_id = uuid::Uuid::new_v4().to_string();

    let request = Request::new(
        format!(
            r#"
            query {{
                business(id: "{business_id}") {{
                    id
                    name
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "GraphQL errors: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let business = data.get("business").unwrap();

    assert!(business.is_null(), "Should return null for non-existent business");
}

#[tokio::test]
async fn test_business_query_invalid_id() {
    let schema = create_schema();

    let request = Request::new(
        r#"
        query {
            business(id: "invalid-uuid") {
                id
            }
        }
        "#,
    );

    let response = schema.execute(request).await;

    assert!(!response.errors.is_empty(), "Invalid UUID should be rejected");
}

#[tokio::test]
async fn test_reviews_query_returns_empty() {
    let schema = create_schema();

    let business_id = uuid::Uuid::new_v4().to_string();

    let request = Request::new(
        format!(
            r#"
            query {{
                reviews(businessId: "{business_id}") {{
                    id
                    rating
                }}
            }}
            "#
        ),
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "GraphQL errors: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let reviews = data.get("reviews").unwrap();

    let reviews_array = reviews.as_array().unwrap();
    assert!(reviews_array.is_empty(), "Should return empty reviews");
}

#[tokio::test]
async fn test_categories_query_returns_empty() {
    let schema = create_schema();

    let request = Request::new(
        r#"
        query {
            categories {
                id
                name
            }
        }
        "#,
    );

    let response = schema.execute(request).await;

    assert!(response.errors.is_empty(), "GraphQL errors: {:?}", response.errors);

    let data: serde_json::Value = response.data.into_json().unwrap();
    let categories = data.get("categories").unwrap();

    let categories_array = categories.as_array().unwrap();
    assert!(categories_array.is_empty(), "Should return empty categories");
}
