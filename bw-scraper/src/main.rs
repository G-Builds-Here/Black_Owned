//! bw-scraper entry point: config -> Postgres pool -> axum HTTP server.

use bw_scraper::api::{router, AppState};
use bw_scraper::config::Config;
use bw_scraper::importer::PostgresImporter;
use bw_scraper::searxng::SearxngClient;
use sqlx::PgPool;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "bw_scraper=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;
    let masked_database = mask_url(&config.database_url);
    tracing::info!(
        searxng = %config.searxng_url,
        database = %masked_database,
        "starting bw-scraper"
    );

    let pool = PgPool::connect(&config.database_url)
        .await
        .map_err(|e| anyhow::format_err!("Postgres connection failed: {e}"))?;

    let state = AppState {
        importer: PostgresImporter::new(pool.clone()),
        searxng: SearxngClient::new(&config.searxng_url),
        pool,
        config,
    };

    let addr = format!("{}:{}", state.config.host, state.config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "listening");

    axum::serve(listener, router(state)).await?;
    Ok(())
}

/// Keep credentials out of structured logs.
fn mask_url(url: &str) -> String {
    url.rsplit('@').next().unwrap_or(url).to_string()
}
