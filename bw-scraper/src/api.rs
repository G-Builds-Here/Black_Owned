//! API module
//!
//! Provides HTTP API endpoints for the scraper service.

/// API server configuration
pub struct ApiConfig {
    /// Host to bind to
    pub host: String,
    /// Port to bind to
    pub port: u16,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8080,
        }
    }
}
