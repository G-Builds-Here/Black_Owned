//! Black Owned Scraper - Entry Point
//!
//! This is the main entry point for the scraper binary.

use bw_scraper::scraper::GoogleMapsScraper;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "bw_scraper=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Black Owned Scraper");

    // Create scraper instance
    let scraper = GoogleMapsScraper::new();

    // Example: scrape with pagination
    // In production, this would be driven by CLI args or config
    match scraper.scrape_with_pagination("black owned businesses", 10).await {
        Ok(results) => tracing::info!("Fetched {} businesses", results.len()),
        Err(e) => tracing::error!("Scrape failed: {}", e),
    }

    Ok(())
}
