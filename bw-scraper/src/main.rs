//! bw-scraper - Web scraping service for Black Owned directory
//!
//! This service scrapes business data from external sources (Google Maps, Yelp, Facebook)
//! and stores it in the Black Owned database.

use anyhow::Result;
use tracing::{info, Level};
use tracing_subscriber::EnvFilter;

mod scraper;
mod config;
mod connectors;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    info!("Starting bw-scraper service...");

    // Load configuration
    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("Connecting to PostgreSQL...");
    let pg_pool = sqlx::PgPool::connect(&config.database_url).await?;
    info!("PostgreSQL connection established");

    info!("Connecting to NATS...");
    let nats_conn = async_nats::connect(&config.nats_url).await?;
    info!("NATS connection established");

    info!("Connecting to Redis...");
    let redis_client = redis::Client::open(&config.redis_url)?;
    let redis_conn = redis_client.get_tokio_connection().await?;
    info!("Redis connection established");

    info!("Connecting to ClickHouse...");
    let clickhouse_client = clickhouse::Client::default()
        .with_url(&config.clickhouse_url);
    info!("ClickHouse connection configured");

    info!("All service connections established. bw-scraper is ready.");

    // Keep the service running
    tokio::signal::ctrl_c().await?;
    info!("Shutting down bw-scraper...");

    Ok(())
}
