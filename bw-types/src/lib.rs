//! Black Owned Types Library
//!
//! Core domain types for the Black Owned platform.

pub mod email;

use chrono::{DateTime, Utc};
use derive_builder::Builder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Business entity representing a black-owned business
#[derive(Debug, Clone, Serialize, Deserialize, Builder, PartialEq)]
#[builder(setter(into))]
pub struct Business {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub category_id: Uuid,
    pub owner_id: Uuid,
    pub verified: bool,
    pub address: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Review entity for business reviews
#[derive(Debug, Clone, Serialize, Deserialize, Builder, PartialEq)]
#[builder(setter(into))]
pub struct Review {
    pub id: Uuid,
    pub business_id: Uuid,
    pub user_id: Uuid,
    pub rating: u8,
    pub comment: String,
    pub created_at: DateTime<Utc>,
}

/// User entity for platform users
#[derive(Debug, Clone, Serialize, Deserialize, Builder, PartialEq)]
#[builder(setter(into))]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
}

/// Verification record for business verification
#[derive(Debug, Clone, Serialize, Deserialize, Builder, PartialEq)]
#[builder(setter(into))]
pub struct Verification {
    pub id: Uuid,
    pub business_id: Uuid,
    pub verifier_id: Uuid,
    pub verified_at: DateTime<Utc>,
    pub method: String,
}

/// Message entity for platform messaging
#[derive(Debug, Clone, Serialize, Deserialize, Builder, PartialEq)]
#[builder(setter(into))]
pub struct Message {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub recipient_id: Uuid,
    pub content: String,
    pub sent_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
}

/// Event entity for platform events
#[derive(Debug, Clone, Serialize, Deserialize, Builder, PartialEq)]
#[builder(setter(into))]
pub struct Event {
    pub id: Uuid,
    pub business_id: Uuid,
    pub name: String,
    pub description: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

/// Category entity for business categories
#[derive(Debug, Clone, Serialize, Deserialize, Builder, PartialEq)]
#[builder(setter(into))]
pub struct Category {
    pub id: Uuid,
    pub name: String,
    pub description: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_business_roundtrip() {
        let business = Business {
            id: Uuid::new_v4(),
            name: "Test Business".to_string(),
            description: Some("A test business".to_string()),
            category_id: Uuid::new_v4(),
            owner_id: Uuid::new_v4(),
            verified: true,
            address: Some("123 Main St".to_string()),
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&business).unwrap();
        let deserialized: Business = serde_json::from_str(&json).unwrap();

        assert_eq!(business.id, deserialized.id);
        assert_eq!(business.name, deserialized.name);
        assert_eq!(business.category_id, deserialized.category_id);
        assert_eq!(business.owner_id, deserialized.owner_id);
        assert_eq!(business.verified, deserialized.verified);
        assert_eq!(business.created_at, deserialized.created_at);
    }

    #[test]
    fn test_review_roundtrip() {
        let review = Review {
            id: Uuid::new_v4(),
            business_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            rating: 5,
            comment: "Great business!".to_string(),
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&review).unwrap();
        let deserialized: Review = serde_json::from_str(&json).unwrap();

        assert_eq!(review.id, deserialized.id);
        assert_eq!(review.business_id, deserialized.business_id);
        assert_eq!(review.user_id, deserialized.user_id);
        assert_eq!(review.rating, deserialized.rating);
        assert_eq!(review.comment, deserialized.comment);
        assert_eq!(review.created_at, deserialized.created_at);
    }

    #[test]
    fn test_user_roundtrip() {
        let user = User {
            id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            display_name: "Test User".to_string(),
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&user).unwrap();
        let deserialized: User = serde_json::from_str(&json).unwrap();

        assert_eq!(user.id, deserialized.id);
        assert_eq!(user.email, deserialized.email);
        assert_eq!(user.display_name, deserialized.display_name);
        assert_eq!(user.created_at, deserialized.created_at);
    }

    #[test]
    fn test_verification_roundtrip() {
        let verification = Verification {
            id: Uuid::new_v4(),
            business_id: Uuid::new_v4(),
            verifier_id: Uuid::new_v4(),
            verified_at: Utc::now(),
            method: "document".to_string(),
        };

        let json = serde_json::to_string(&verification).unwrap();
        let deserialized: Verification = serde_json::from_str(&json).unwrap();

        assert_eq!(verification.id, deserialized.id);
        assert_eq!(verification.business_id, deserialized.business_id);
        assert_eq!(verification.verifier_id, deserialized.verifier_id);
        assert_eq!(verification.verified_at, deserialized.verified_at);
        assert_eq!(verification.method, deserialized.method);
    }

    #[test]
    fn test_message_roundtrip() {
        let message = Message {
            id: Uuid::new_v4(),
            sender_id: Uuid::new_v4(),
            recipient_id: Uuid::new_v4(),
            content: "Hello!".to_string(),
            sent_at: Utc::now(),
            read_at: None,
        };

        let json = serde_json::to_string(&message).unwrap();
        let deserialized: Message = serde_json::from_str(&json).unwrap();

        assert_eq!(message.id, deserialized.id);
        assert_eq!(message.sender_id, deserialized.sender_id);
        assert_eq!(message.recipient_id, deserialized.recipient_id);
        assert_eq!(message.content, deserialized.content);
        assert_eq!(message.sent_at, deserialized.sent_at);
        assert_eq!(message.read_at, deserialized.read_at);
    }

    #[test]
    fn test_event_roundtrip() {
        let event = Event {
            id: Uuid::new_v4(),
            business_id: Uuid::new_v4(),
            name: "Test Event".to_string(),
            description: "A test event".to_string(),
            start_time: Utc::now(),
            end_time: Utc::now(),
        };

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: Event = serde_json::from_str(&json).unwrap();

        assert_eq!(event.id, deserialized.id);
        assert_eq!(event.business_id, deserialized.business_id);
        assert_eq!(event.name, deserialized.name);
        assert_eq!(event.description, deserialized.description);
        assert_eq!(event.start_time, deserialized.start_time);
        assert_eq!(event.end_time, deserialized.end_time);
    }

    #[test]
    fn test_category_roundtrip() {
        let category = Category {
            id: Uuid::new_v4(),
            name: "Technology".to_string(),
            description: "Tech businesses".to_string(),
        };

        let json = serde_json::to_string(&category).unwrap();
        let deserialized: Category = serde_json::from_str(&json).unwrap();

        assert_eq!(category.id, deserialized.id);
        assert_eq!(category.name, deserialized.name);
        assert_eq!(category.description, deserialized.description);
    }

    #[test]
    fn test_business_builder() {
        let business = BusinessBuilder::default()
            .id(Uuid::new_v4())
            .name("Test")
            .description(Some("Test description".to_string()))
            .category_id(Uuid::new_v4())
            .owner_id(Uuid::new_v4())
            .verified(true)
            .address(Some("123 Test St".to_string()))
            .created_at(Utc::now())
            .build()
            .unwrap();

        assert_eq!(business.name, "Test");
        assert!(business.verified);
    }
}
