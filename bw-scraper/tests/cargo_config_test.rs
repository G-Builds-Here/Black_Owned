//! QA tests for Cargo.toml configuration (LOC-0070-AC3)
//!
//! These tests verify that the Rust project configuration is correct:
//! - Edition 2021 is specified via workspace inheritance
//! - Feature flags are defined for optional components
//! - Optional dependencies are correctly configured

use std::process::Command;

/// Helper struct to represent parsed Cargo.toml structure
#[derive(Debug)]
struct CargoConfig {
    edition: String,
    has_scraper_feature: bool,
    has_api_feature: bool,
    axum_is_optional: bool,
}

/// Read Cargo.toml content from the committed version (feature/LOC-0070-AC3)
fn read_cargo_toml_from_commit() -> String {
    let output = Command::new("git")
        .args(["show", "feature/LOC-0070-AC3:bw-scraper/Cargo.toml"])
        .output()
        .expect("Failed to execute git command");

    assert!(output.status.success(), "git show failed: {}", String::from_utf8_lossy(&output.stderr));

    String::from_utf8(output.stdout).expect("Invalid UTF-8 in Cargo.toml")
}

/// Read workspace Cargo.toml from the committed version
fn read_workspace_cargo_toml() -> String {
    let output = Command::new("git")
        .args(["show", "feature/LOC-0070-AC3:Cargo.toml"])
        .output()
        .expect("Failed to execute git command");

    assert!(output.status.success(), "git show failed: {}", String::from_utf8_lossy(&output.stderr));

    String::from_utf8(output.stdout).expect("Invalid UTF-8 in Cargo.toml")
}

/// Parse Cargo.toml to extract configuration
fn parse_bw_scraper_cargo_toml() -> CargoConfig {
    let content = read_cargo_toml_from_commit();

    CargoConfig {
        edition: extract_edition(),
        has_scraper_feature: content.contains("scraper = []"),
        has_api_feature: content.contains("api = [\"axum\"]"),
        axum_is_optional: content.contains("optional = true"),
    }
}

/// Extract edition from workspace Cargo.toml
fn extract_edition() -> String {
    let workspace_content = read_workspace_cargo_toml();

    // Look for edition = "2021" in workspace.package section
    if workspace_content.contains("edition = \"2021\"") {
        "2021".to_string()
    } else {
        "unknown".to_string()
    }
}

/// Test that edition 2021 is specified in workspace
#[tokio::test]
async fn test_edition_2021_specified() {
    let config = parse_bw_scraper_cargo_toml();

    assert_eq!(
        config.edition, "2021",
        "Edition should be 2021 as specified in workspace configuration"
    );
}

/// Test that scraper feature is defined
#[tokio::test]
async fn test_scraper_feature_defined() {
    let config = parse_bw_scraper_cargo_toml();

    assert!(
        config.has_scraper_feature,
        "scraper feature should be defined in [features] section"
    );
}

/// Test that api feature is defined with axum dependency
#[tokio::test]
async fn test_api_feature_defined() {
    let config = parse_bw_scraper_cargo_toml();

    assert!(
        config.has_api_feature,
        "api feature should be defined with axum as dependency"
    );
}

/// Test that axum is marked as optional dependency
#[tokio::test]
async fn test_axum_is_optional() {
    let config = parse_bw_scraper_cargo_toml();

    assert!(
        config.axum_is_optional,
        "axum should be marked as optional = true to enable feature-gating"
    );
}

/// Test that default features include both scraper and api
#[tokio::test]
async fn test_default_features_include_scraper_and_api() {
    let content = read_cargo_toml_from_commit();

    assert!(
        content.contains("default = [\"scraper\", \"api\"]"),
        "Default features should include both scraper and api"
    );
}

/// Test that features section exists in Cargo.toml
#[tokio::test]
async fn test_features_section_exists() {
    let content = read_cargo_toml_from_commit();

    assert!(
        content.contains("[features]"),
        "Cargo.toml should contain [features] section"
    );
}
