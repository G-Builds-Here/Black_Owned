//! Configuration module for bw-scraper

use anyhow::{Context, Result};
use serde::Deserialize;

/// Application configuration loaded from environment variables
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// PostgreSQL connection string
    pub database_url: String,
    /// NATS server URL
    pub nats_url: String,
    /// Redis connection string
    pub redis_url: String,
    /// ClickHouse server URL
    pub clickhouse_url: String,
    /// Log level (debug, info, warn, error)
    #[serde(default = "default_log_level")]
    pub log_level: String,
}

fn default_log_level() -> String {
    "info".to_string()
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .context("DATABASE_URL environment variable not set")?;
        let nats_url = std::env::var("NATS_URL")
            .context("NATS_URL environment variable not set")?;
        let redis_url = std::env::var("REDIS_URL")
            .context("REDIS_URL environment variable not set")?;
        let clickhouse_url = std::env::var("CLICKHOUSE_URL")
            .context("CLICKHOUSE_URL environment variable not set")?;
        let log_level = std::env::var("LOG_LEVEL").unwrap_or_else(|_| default_log_level());

        Ok(Self {
            database_url,
            nats_url,
            redis_url,
            clickhouse_url,
            log_level,
        })
    }
}
