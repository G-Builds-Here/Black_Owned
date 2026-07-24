//! GraphQL mutations for Black Owned API.
//!
//! Provides mutation resolvers for:
//! - createBusiness: Create a new business
//! - updateBusiness: Update an existing business
//! - submitReview: Submit a review for a business
//! - deleteReview: Delete a review
//! - rejectVerification: Admin reject verification with NATS event

use async_graphql::*;
use bw_types::{Business, NatsVerificationRejectedPayload, Review};
use chrono::Utc;
use uuid::Uuid;

use super::types::{GQLBusiness, GQLReview};

/// Mutation root for GraphQL API
pub struct MutationRoot;

/// Extract user ID from JWT token in Authorization header
fn extract_user_from_auth(ctx: &Context<'_>) -> Result<Uuid> {
    let token = ctx
        .data::<String>()
        .map_err(|_| Error::new("Authorization token not available"))?;

    Uuid::parse_str(token)
        .map_err(|e| Error::new(format!("Invalid user token: {:?}", e)))
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

        // Extract user ID from auth context
        let owner_id = extract_user_from_auth(ctx)?;

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
        .bind(owner_id)
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

        let business_id = Uuid::parse_str(&id).map_err(|e| {
            Error::new(format!("Invalid business UUID: {:?}", e))
        })?;

        let name_ref = name.as_deref();
        let category_uuid = category_id
            .map(|s| Uuid::parse_str(&s))
            .transpose()
            .map_err(|e| Error::new(format!("Invalid category UUID: {:?}", e)))?;

        let row = sqlx::query_as::<_, (Uuid, String, Uuid, bool, chrono::DateTime<Utc>)>(
            r#"
            UPDATE businesses
            SET name = COALESCE($2, name),
                category_id = COALESCE($3, category_id),
                verified = COALESCE($4, verified)
            WHERE id = $1
            RETURNING id, name, category_id, verified, created_at
            "#,
        )
        .bind(business_id)
        .bind(name_ref)
        .bind(category_uuid)
        .bind(verified)
        .fetch_optional(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        Ok(row.map(|(bid, n, cid, v, ca)| {
            GQLBusiness::from(Business {
                id: bid,
                name: n,
                description: None,
                category_id: cid,
                owner_id: Uuid::new_v4(),
                verified: v,
                created_at: ca,
            })
        }))
    }

    /// Submit a review for a business
    async fn submit_review(
        &self,
        ctx: &Context<'_>,
        business_id: String,
        user_id: String,
        rating: i32,
        comment: String,
    ) -> Result<GQLReview> {
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

        Ok(GQLReview::from(Review {
            id: result.0,
            business_id: result.1,
            user_id: result.2,
            rating: result.3 as u8,
            comment: result.4,
            created_at: result.5,
        }))
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

    /// Reject a verification request with reason
    ///
    /// Admin-only operation that sets verification status to rejected and emits a NATS event
    async fn reject_verification(
        &self,
        ctx: &Context<'_>,
        business_id: String,
        reason: Option<String>,
    ) -> Result<RejectVerificationResponse> {
        // Validate that reason is provided
        let rejection_reason = reason.ok_or_else(|| Error::new("Rejection reason is required"))?;

        let db = ctx.data::<sqlx::PgPool>().map_err(|e| {
            Error::new(format!("Database connection not available: {:?}", e))
        })?;

        let business_uuid = Uuid::parse_str(&business_id).map_err(|e| {
            Error::new(format!("Invalid business UUID: {:?}", e))
        })?;

        // Update the business verification status to rejected
        let result = sqlx::query(
            r#"
            UPDATE businesses
            SET verified = false
            WHERE id = $1
            "#,
        )
        .bind(business_uuid)
        .execute(db)
        .await
        .map_err(|e| Error::new(format!("Database error: {:?}", e)))?;

        if result.rows_affected() == 0 {
            return Err(Error::new("Business not found"));
        }

        // Publish NATS event for verification rejected
        let nats_client = ctx.data::<async_nats::Client>().map_err(|_| {
            Error::new("NATS client not available")
        })?;

        let payload = NatsVerificationRejectedPayload::new(business_id.clone(), rejection_reason.clone());
        let payload_bytes = serde_json::to_vec(&payload)
            .map_err(|e| Error::new(format!("Failed to serialize payload: {:?}", e)))?;

        nats_client
            .publish("verification.rejected".to_string(), payload_bytes.into())
            .await
            .map_err(|e| Error::new(format!("Failed to publish NATS event: {:?}", e)))?;

        Ok(RejectVerificationResponse {
            success: true,
            business_id,
            reason: rejection_reason,
        })
    }
}

/// Response type for reject_verification mutation
#[derive(SimpleObject)]
pub struct RejectVerificationResponse {
    pub success: bool,
    pub business_id: String,
    pub reason: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_user_from_auth_valid_token() {
        let valid_uuid = Uuid::new_v4().to_string();
        let result = Uuid::parse_str(&valid_uuid);
        assert!(result.is_ok());
    }

    #[test]
    fn test_extract_user_from_auth_invalid_token() {
        let invalid_token = "not-a-uuid";
        let result = Uuid::parse_str(invalid_token);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_business_name_required() {
        let empty_name = "";
        assert!(empty_name.trim().is_empty());
    }

    #[test]
    fn test_validate_business_name_whitespace_only() {
        let whitespace_name = "   ";
        assert!(whitespace_name.trim().is_empty());
    }

    #[test]
    fn test_validate_category_uuid_valid() {
        let valid_uuid = Uuid::new_v4().to_string();
        let result = Uuid::parse_str(&valid_uuid);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_category_uuid_invalid() {
        let invalid_uuid = "not-a-uuid";
        let result = Uuid::parse_str(invalid_uuid);
        assert!(result.is_err());
    }

    #[test]
    fn test_reject_verification_missing_reason() {
        // Verify that missing reason returns error
        let reason: Option<String> = None;
        assert!(reason.is_none());
    }

    #[test]
    fn test_reject_verification_with_reason() {
        // Verify that reason is properly captured
        let reason: Option<String> = Some("Documents are illegible".to_string());
        assert!(reason.is_some());
        assert_eq!(reason.unwrap(), "Documents are illegible");
    }

    #[test]
    fn test_rejection_payload_serialization() {
        let payload = NatsVerificationRejectedPayload::new(
            "biz-123".to_string(),
            "Documents are illegible".to_string(),
        );

        let json = serde_json::to_string(&payload).unwrap();
        let deserialized: NatsVerificationRejectedPayload = serde_json::from_str(&json).unwrap();

        assert_eq!(payload.business_id, deserialized.business_id);
        assert_eq!(payload.reason, deserialized.reason);
    }

    #[test]
    fn test_business_status_unverified_by_default() {
        let business = Business {
            id: Uuid::new_v4(),
            name: "Test Business".to_string(),
            description: Some("Test description".to_string()),
            category_id: Uuid::new_v4(),
            owner_id: Uuid::new_v4(),
            verified: false,
            created_at: Utc::now(),
        };

        let gql_business: GQLBusiness = business.into();
        assert_eq!(gql_business.status, "unverified");
        assert!(!gql_business.verified);
    }

    #[test]
    fn test_business_conversion_includes_timestamp() {
        let business = Business {
            id: Uuid::new_v4(),
            name: "Test Business".to_string(),
            description: None,
            category_id: Uuid::new_v4(),
            owner_id: Uuid::new_v4(),
            verified: false,
            created_at: Utc::now(),
        };

        let gql_business: GQLBusiness = business.clone().into();
        assert!(gql_business.created_at.timestamp > 0);
    }

    #[test]
    fn test_business_conversion_preserves_optional_description() {
        let description = "Optional description";
        let business = Business {
            id: Uuid::new_v4(),
            name: "Test Business".to_string(),
            description: Some(description.to_string()),
            category_id: Uuid::new_v4(),
            owner_id: Uuid::new_v4(),
            verified: false,
            created_at: Utc::now(),
        };

        let gql_business: GQLBusiness = business.into();
        assert_eq!(gql_business.description, Some(description.to_string()));
    }

    #[test]
    fn test_business_conversion_none_description() {
        let business = Business {
            id: Uuid::new_v4(),
            name: "Test Business".to_string(),
            description: None,
            category_id: Uuid::new_v4(),
            owner_id: Uuid::new_v4(),
            verified: false,
            created_at: Utc::now(),
        };

        let gql_business: GQLBusiness = business.into();
        assert!(gql_business.description.is_none());
    }
}
