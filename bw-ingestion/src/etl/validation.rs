//! Data validation for transformed ETL data.
//!
//! Validates phone numbers (E.164 format), addresses (postal standards),
//! and URLs (HTTP/HTTPS).

use anyhow::{anyhow, Result};

/// Validation result for a single field.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationResult {
    pub valid: bool,
    pub field: String,
    pub message: String,
}

impl ValidationResult {
    pub fn valid(field: &str, message: &str) -> Self {
        Self {
            valid: true,
            field: field.to_string(),
            message: message.to_string(),
        }
    }

    pub fn invalid(field: &str, message: &str) -> Self {
        Self {
            valid: false,
            field: field.to_string(),
            message: message.to_string(),
        }
    }
}

/// Validates that a phone number is in E.164 format.
///
/// E.164 format: +[country code][number], max 15 digits after the +
/// Examples: +14155552671, +442071838750, +919876543210
///
/// # Errors
///
/// Returns an error if the phone number is not in valid E.164 format.
pub fn validate_phone_e164(phone: &str) -> Result<()> {
    if phone.is_empty() {
        return Err(anyhow!("Phone number cannot be empty"));
    }

    if !phone.starts_with('+') {
        return Err(anyhow!(
            "Phone number must start with '+' (E.164 format): {}",
            phone
        ));
    }

    let digits = &phone[1..]; // Remove the '+'

    if digits.is_empty() {
        return Err(anyhow!("Phone number must have digits after '+'"));
    }

    if digits.len() > 15 {
        return Err(anyhow!(
            "Phone number too long (max 15 digits after '+'): {}",
            phone
        ));
    }

    if !digits.chars().all(|c| c.is_ascii_digit()) {
        return Err(anyhow!(
            "Phone number must contain only digits after '+': {}",
            phone
        ));
    }

    Ok(())
}

/// Validates that an address meets basic postal standards.
///
/// Checks for:
/// - Non-empty address
/// - Contains at least a street address and postal code pattern
/// - Postal code format validation (US, UK, and generic patterns)
///
/// # Errors
///
/// Returns an error if the address does not meet postal standards.
pub fn validate_address_postal(address: &str) -> Result<()> {
    if address.is_empty() {
        return Err(anyhow!("Address cannot be empty"));
    }

    let trimmed = address.trim();

    if trimmed.len() < 5 {
        return Err(anyhow!(
            "Address too short to be valid: {}",
            address
        ));
    }

    // Check for postal code pattern (US ZIP, UK postcode, or generic numeric)
    let has_postal_code = trimmed.contains(|c: char| c.is_ascii_digit());

    if !has_postal_code {
        return Err(anyhow!(
            "Address must contain a postal/ZIP code: {}",
            address
        ));
    }

    // Validate US ZIP code format if present (12345 or 12345-6789)
    let us_zip_pattern = regex::Regex::new(r"\b\d{5}(-\d{4})?\b").unwrap();
    let uk_postcode_pattern = regex::Regex::new(r"[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}").unwrap();

    let upper_address = trimmed.to_uppercase();

    let has_valid_postal = us_zip_pattern.is_match(trimmed)
        || uk_postcode_pattern.is_match(&upper_address)
        || regex::Regex::new(r"\d{4,10}").unwrap().is_match(trimmed);

    if !has_valid_postal {
        return Err(anyhow!(
            "Address does not contain a valid postal/ZIP code format: {}",
            address
        ));
    }

    Ok(())
}

/// Validates that a URL is in valid HTTP or HTTPS format.
///
/// # Errors
///
/// Returns an error if the URL is not valid or does not use HTTP/HTTPS.
pub fn validate_url_http_https(url: &str) -> Result<()> {
    if url.is_empty() {
        return Err(anyhow!("URL cannot be empty"));
    }

    // Check for http:// or https:// prefix
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(anyhow!(
            "URL must use HTTP or HTTPS protocol: {}",
            url
        ));
    }

    // Basic URL structure validation
    let url_without_proto = if url.starts_with("https://") {
        &url[8..]
    } else {
        &url[7..]
    };

    if url_without_proto.is_empty() {
        return Err(anyhow!("URL must have a host after protocol: {}", url));
    }

    // Check for valid host characters (alphanumeric, dots, hyphens)
    let host_end = url_without_proto
        .find(|c: char| c == '/' || c == ':' || c == '?')
        .unwrap_or(url_without_proto.len());

    let host = &url_without_proto[..host_end];

    if host.is_empty() {
        return Err(anyhow!("URL must have a valid host: {}", url));
    }

    // Validate host format
    if !host.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err(anyhow!(
            "URL host contains invalid characters: {}",
            url
        ));
    }

    Ok(())
}

/// Validates all transformed data fields.
///
/// Returns a vector of validation results for each field that was checked.
pub fn validate_transformed_data(
    phone: Option<&str>,
    address: Option<&str>,
    website: Option<&str>,
) -> Vec<ValidationResult> {
    let mut results = Vec::new();

    if let Some(phone) = phone {
        match validate_phone_e164(phone) {
            Ok(_) => results.push(ValidationResult::valid("phone", "Phone is in valid E.164 format")),
            Err(e) => results.push(ValidationResult::invalid("phone", &e.to_string())),
        }
    }

    if let Some(address) = address {
        match validate_address_postal(address) {
            Ok(_) => results.push(ValidationResult::valid("address", "Address meets postal standards")),
            Err(e) => results.push(ValidationResult::invalid("address", &e.to_string())),
        }
    }

    if let Some(website) = website {
        match validate_url_http_https(website) {
            Ok(_) => results.push(ValidationResult::valid("website", "URL uses valid HTTP/HTTPS protocol")),
            Err(e) => results.push(ValidationResult::invalid("website", &e.to_string())),
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    // Phone validation tests
    #[test]
    fn test_validate_phone_e164_valid_us() {
        assert!(validate_phone_e164("+14155552671").is_ok());
    }

    #[test]
    fn test_validate_phone_e164_valid_uk() {
        assert!(validate_phone_e164("+442071838750").is_ok());
    }

    #[test]
    fn test_validate_phone_e164_valid_india() {
        assert!(validate_phone_e164("+919876543210").is_ok());
    }

    #[test]
    fn test_validate_phone_e164_missing_plus() {
        let result = validate_phone_e164("4155552671");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("'+'"));
    }

    #[test]
    fn test_validate_phone_e164_empty() {
        let result = validate_phone_e164("");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_phone_e164_non_numeric() {
        let result = validate_phone_e164("+1415abc2671");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("digits"));
    }

    #[test]
    fn test_validate_phone_e164_too_long() {
        let result = validate_phone_e164("+1234567890123456");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too long"));
    }

    // Address validation tests
    #[test]
    fn test_validate_address_postal_valid_us() {
        assert!(validate_address_postal("123 Main St, New York, NY 10001").is_ok());
    }

    #[test]
    fn test_validate_address_postal_valid_zip_plus_four() {
        assert!(validate_address_postal("456 Oak Ave, Los Angeles, CA 90001-1234").is_ok());
    }

    #[test]
    fn test_validate_address_postal_valid_uk() {
        assert!(validate_address_postal("10 Downing Street, London SW1A 2AA").is_ok());
    }

    #[test]
    fn test_validate_address_postal_valid_generic() {
        assert!(validate_address_postal("789 Business Rd, Suite 100, 12345").is_ok());
    }

    #[test]
    fn test_validate_address_postal_empty() {
        let result = validate_address_postal("");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_address_postal_too_short() {
        let result = validate_address_postal("123");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_address_postal_no_postal_code() {
        let result = validate_address_postal("123 Main Street, New York");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("postal"));
    }

    // URL validation tests
    #[test]
    fn test_validate_url_http_https_valid_https() {
        assert!(validate_url_http_https("https://www.example.com").is_ok());
    }

    #[test]
    fn test_validate_url_http_https_valid_http() {
        assert!(validate_url_http_https("http://example.com").is_ok());
    }

    #[test]
    fn test_validate_url_http_https_with_path() {
        assert!(validate_url_http_https("https://example.com/path/to/page").is_ok());
    }

    #[test]
    fn test_validate_url_http_https_with_port() {
        assert!(validate_url_http_https("https://example.com:8080").is_ok());
    }

    #[test]
    fn test_validate_url_http_https_missing_protocol() {
        let result = validate_url_http_https("www.example.com");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("HTTP"));
    }

    #[test]
    fn test_validate_url_http_https_ftp_protocol() {
        let result = validate_url_http_https("ftp://example.com");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("HTTP"));
    }

    #[test]
    fn test_validate_url_http_https_empty() {
        let result = validate_url_http_https("");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_url_http_https_empty_host() {
        let result = validate_url_http_https("https://");
        assert!(result.is_err());
    }

    // Combined validation tests
    #[test]
    fn test_validate_transformed_data_all_valid() {
        let results = validate_transformed_data(
            Some("+14155552671"),
            Some("123 Main St, New York, NY 10001"),
            Some("https://example.com"),
        );

        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| r.valid));
    }

    #[test]
    fn test_validate_transformed_data_all_invalid() {
        let results = validate_transformed_data(
            Some("invalid-phone"),
            Some("invalid"),
            Some("ftp://bad.com"),
        );

        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| !r.valid));
    }

    #[test]
    fn test_validate_transformed_data_none_provided() {
        let results = validate_transformed_data(None, None, None);
        assert!(results.is_empty());
    }

    #[test]
    fn test_validate_transformed_data_partial() {
        let results = validate_transformed_data(
            Some("+14155552671"),
            None,
            Some("https://example.com"),
        );

        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.valid));
    }
}
