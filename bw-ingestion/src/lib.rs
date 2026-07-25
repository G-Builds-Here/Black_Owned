//! Data ingestion module for Black Owned platform.

#[cfg(feature = "integration_test")]
pub mod service_connectivity;

#[cfg(feature = "integration_test")]
pub mod image_processor;

#[cfg(feature = "integration_test")]
pub mod image_worker;

#[cfg(feature = "integration_test")]
pub mod image_worker_integration;

use bw_types::Business;
use serde::{Deserialize, Serialize};

/// Ingestion result type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IngestionResult {
    pub success: bool,
    pub records_processed: usize,
    pub errors: Vec<String>,
}

/// Input record for business data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessInput {
    pub name: String,
    pub category_name: String,
    pub owner_email: String,
}

/// Ingestion handler for business records
pub struct BusinessIngestionHandler;

impl BusinessIngestionHandler {
    /// Process a batch of business input records
    ///
    /// Returns a Result with either the created Business or an error message.
    /// Uses proper error handling instead of [`unwrap()`](std::result::Result::unwrap) for production safety.
    ///
    /// # Errors
    ///
    /// Returns an error if the business name or owner email is empty.
    pub fn process_record(
        input: &BusinessInput,
        category_id: &uuid::Uuid,
    ) -> Result<Business, String> {
        if input.name.is_empty() {
            return Err("Business name cannot be empty".to_string());
        }

        if input.owner_email.is_empty() {
            return Err("Owner email cannot be empty".to_string());
        }

        Ok(Business {
            id: uuid::Uuid::new_v4(),
            name: input.name.clone(),
            category_id: *category_id,
            verified: false,
            created_at: chrono::Utc::now(),
        })
    }

    /// Process a batch of business records
    #[must_use]
    pub fn process_batch(
        inputs: &[BusinessInput],
        category_id: &uuid::Uuid,
    ) -> IngestionResult {
        let mut errors = Vec::new();
        let mut processed = 0;

        for input in inputs {
            match Self::process_record(input, category_id) {
                Ok(_) => processed += 1,
                Err(e) => errors.push(format!("Failed to process {}: {}", input.name, e)),
            }
        }

        IngestionResult {
            success: errors.is_empty(),
            records_processed: processed,
            errors,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_valid_record() {
        let input = BusinessInput {
            name: "Test Business".to_string(),
            category_name: "Tech".to_string(),
            owner_email: "owner@test.com".to_string(),
        };
        let category_id = uuid::Uuid::new_v4();

        let result = BusinessIngestionHandler::process_record(&input, &category_id);
        assert!(result.is_ok());

        let business = result.unwrap();
        assert_eq!(business.name, "Test Business");
        assert!(!business.verified);
    }

    #[test]
    fn test_process_empty_name() {
        let input = BusinessInput {
            name: String::new(),
            category_name: "Tech".to_string(),
            owner_email: "owner@test.com".to_string(),
        };
        let category_id = uuid::Uuid::new_v4();

        let result = BusinessIngestionHandler::process_record(&input, &category_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_process_batch_mixed() {
        let inputs = vec![
            BusinessInput {
                name: "Business 1".to_string(),
                category_name: "Tech".to_string(),
                owner_email: "a@b.com".to_string(),
            },
            BusinessInput {
                name: String::new(),
                category_name: "Tech".to_string(),
                owner_email: "c@d.com".to_string(),
            },
            BusinessInput {
                name: "Business 2".to_string(),
                category_name: "Retail".to_string(),
                owner_email: "e@f.com".to_string(),
            },
        ];
        let category_id = uuid::Uuid::new_v4();

        let result = BusinessIngestionHandler::process_batch(&inputs, &category_id);

        assert_eq!(result.records_processed, 2);
        assert_eq!(result.errors.len(), 1);
        assert!(!result.success);
    }
}
