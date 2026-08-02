//! bw-api binary entry point

use axum::{routing::get, Router};
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, Level};

/// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    info!("Starting bw-api server...");

    // Build router with health check
    let app = Router::new()
        .route("/health", get(health_check))
        .layer(CorsLayer::new().allow_origin(Any).allow_headers(Any));

    let addr = std::env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
    info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
