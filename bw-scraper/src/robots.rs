//! Robots.txt handling for the scraper
//!
//! This module provides utilities to check robots.txt rules
//! when making web scraping requests.

use std::collections::HashSet;
use tracing::{debug, info};

/// Simple robots.txt checker
///
/// This is a minimal implementation that tracks disallowed paths.
/// For production use, consider fetching and parsing actual robots.txt files.
pub struct RobotsChecker {
    /// Set of disallowed paths for the agent
    disallowed_paths: HashSet<String>,
}

impl RobotsChecker {
    /// Create a new robots checker
    #[must_use]
    pub fn new() -> Self {
        Self {
            disallowed_paths: HashSet::new(),
        }
    }

    /// Check if a URL path is allowed to be scraped
    ///
    /// Returns true if the URL is allowed, false if disallowed.
    /// By default, all paths are allowed unless explicitly disallowed.
    pub fn is_allowed(&self, url: &str) -> bool {
        // Parse the URL to extract the path
        let path = Self::extract_path(url);

        // Check if the path is in the disallowed set
        let allowed = !self.disallowed_paths.contains(&path);

        if allowed {
            debug!("URL allowed: {}", url);
        } else {
            info!("URL disallowed by robots rules: {}", url);
        }

        allowed
    }

    /// Add a path to the disallowed set
    pub fn disallow(&mut self, path: &str) {
        self.disallowed_paths.insert(path.to_string());
        debug!("Path disallowed: {}", path);
    }

    /// Extract the path component from a URL
    fn extract_path(url: &str) -> String {
        // Simple extraction - find the path after the domain
        if let Some(start) = url.find("://") {
            let after_protocol = &url[start + 3..];
            if let Some(path_start) = after_protocol.find('/') {
                return after_protocol[path_start..].to_string();
            }
        }
        "/".to_string()
    }
}
impl Default for RobotsChecker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser_creation() {
        let _checker = RobotsChecker::new();
    }

    #[test]
    fn test_default_allows_all() {
        let checker = RobotsChecker::new();
        assert!(checker.is_allowed("https://example.com/path"));
        assert!(checker.is_allowed("https://example.com/"));
    }

    #[test]
    fn test_disallow_blocks_path() {
        let mut checker = RobotsChecker::new();
        checker.disallow("/admin");
        assert!(!checker.is_allowed("https://example.com/admin"));
        assert!(checker.is_allowed("https://example.com/public"));
    }

    #[test]
    fn test_extract_path() {
        assert_eq!(RobotsChecker::extract_path("https://example.com/path"), "/path");
        assert_eq!(RobotsChecker::extract_path("https://example.com/"), "/");
        assert_eq!(RobotsChecker::extract_path("invalid"), "/");
    }
}
