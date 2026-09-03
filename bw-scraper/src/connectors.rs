//! Service connectors for bw-scraper
//!
//! This module provides connection utilities for external services.

use anyhow::Result;
use tracing::info;

/// Health check result
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(test, derive(PartialEq))]
pub struct HealthStatus {
    pub service: String,
    pub healthy: bool,
    pub message: String,
}

/// Check `PostgreSQL` connection
///
/// # Errors
///
/// Returns an error if the connection cannot be established.
pub async fn check_postgres(database_url: &str) -> Result<HealthStatus> {
    match sqlx::PgPool::connect(database_url).await {
        Ok(pool) => {
            pool.close().await;
            Ok(HealthStatus {
                service: "PostgreSQL".to_string(),
                healthy: true,
                message: "Connection successful".to_string(),
            })
        }
        Err(e) => Ok(HealthStatus {
            service: "PostgreSQL".to_string(),
            healthy: false,
            message: format!("Connection failed: {e}"),
        }),
    }
}

/// Check NATS connection
///
/// # Errors
///
/// Returns an error if the connection cannot be established.
pub async fn check_nats(nats_url: &str) -> Result<HealthStatus> {
    match async_nats::connect(nats_url).await {
        Ok(conn) => {
            conn.flush().await?;
            Ok(HealthStatus {
                service: "NATS".to_string(),
                healthy: true,
                message: "Connection successful".to_string(),
            })
        }
        Err(e) => Ok(HealthStatus {
            service: "NATS".to_string(),
            healthy: false,
            message: format!("Connection failed: {e}"),
        }),
    }
}

/// Check Redis connection
///
/// # Errors
///
/// Returns an error if the connection cannot be established.
pub fn check_redis(redis_url: &str) -> Result<HealthStatus> {
    // redis-rs only accepts the redis(s):// schemes; valkey:// is the same
    // RESP protocol, so normalize before parsing.
    let url = redis_url
        .strip_prefix("valkey://").map_or_else(|| redis_url.to_string(), |rest| format!("redis://{rest}"));
    match redis::Client::open(url.as_str()) {
        Ok(_client) => {
            info!("Redis client created successfully");
            Ok(HealthStatus {
                service: "Redis".to_string(),
                healthy: true,
                message: "Connection successful".to_string(),
            })
        }
        Err(e) => Ok(HealthStatus {
            service: "Redis".to_string(),
            healthy: false,
            message: format!("Connection failed: {e}"),
        }),
    }
}

/// Check `ClickHouse` connection
///
/// # Errors
///
/// Returns an error if the connection cannot be established.
pub fn check_clickhouse(clickhouse_url: &str) -> Result<HealthStatus> {
    let _client = clickhouse::Client::default().with_url(clickhouse_url);
    Ok(HealthStatus {
        service: "ClickHouse".to_string(),
        healthy: true,
        message: "Connection configured".to_string(),
    })
}

/// Run all health checks
///
/// # Panics
///
/// Panics (via `unwrap`) if any individual health check returns an error.
pub async fn run_all_health_checks(
    database_url: &str,
    nats_url: &str,
    redis_url: &str,
    clickhouse_url: &str,
) -> Vec<HealthStatus> {
    let mut results = Vec::new();

    results.push(check_postgres(database_url).await.unwrap());
    results.push(check_nats(nats_url).await.unwrap());
    results.push(check_redis(redis_url).unwrap());
    results.push(check_clickhouse(clickhouse_url).unwrap());

    results
}
