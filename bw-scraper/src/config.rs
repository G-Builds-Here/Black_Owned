//! Environment-driven configuration for bw-scraper.

use anyhow::{Context, Result};

/// User-provided SearXNG metasearch instance.
pub const DEFAULT_SEARXNG_URL: &str = "http://192.168.68.50:8888";

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub searxng_url: String,
    pub host: String,
    pub port: u16,
    pub nats_url: Option<String>,
    pub redis_url: Option<String>,
    pub clickhouse_url: Option<String>,
    pub log_level: String,
}

impl Config {
    /// Read configuration from the environment. Only `DATABASE_URL` is
    /// required; optional services degrade out of the health report.
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL must be set")?,
            searxng_url: std::env::var("SEARXNG_URL")
                .unwrap_or_else(|_| DEFAULT_SEARXNG_URL.to_string()),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            nats_url: std::env::var("NATS_URL").ok(),
            redis_url: std::env::var("REDIS_URL").ok(),
            clickhouse_url: std::env::var("CLICKHOUSE_URL").ok(),
            log_level: std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        })
    }
}
