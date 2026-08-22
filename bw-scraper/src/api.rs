//! HTTP surface: health endpoints + POST /scrape.

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::config::Config;
use crate::connectors::{self, HealthStatus};
use crate::etl::EtlPipeline;
use crate::importer::PostgresImporter;
use crate::rate_limiter::RateLimiter;
use crate::scraper::SearxngBusinessScraper;
use crate::searxng::SearxngClient;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub importer: PostgresImporter,
    pub searxng: SearxngClient,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/health/detailed", get(health_detailed))
        .route("/scrape", post(scrape))
        .with_state(state)
}

#[derive(Deserialize)]
pub struct ScrapeRequest {
    pub query: String,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub max_pages: Option<u32>,
}

type ApiError = (StatusCode, Json<serde_json::Value>);

fn err(status: StatusCode, message: impl serde::Serialize) -> ApiError {
    (status, Json(json!({ "error": message })))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "healthy" }))
}

async fn health_detailed(State(state): State<AppState>) -> (StatusCode, Json<serde_json::Value>) {
    let mut checks: Vec<HealthStatus> = Vec::new();

    checks.push(
        connectors::check_postgres(&state.config.database_url)
            .await
            .unwrap_or_else(|e| HealthStatus {
                service: "PostgreSQL".to_string(),
                healthy: false,
                message: format!("check failed: {e}"),
            }),
    );
    if let Some(url) = &state.config.nats_url {
        if let Ok(status) = connectors::check_nats(url).await {
            checks.push(status);
        }
    }
    if let Some(url) = &state.config.redis_url {
        checks.push(connectors::check_redis(url).unwrap_or_else(|e| HealthStatus {
            service: "Redis".to_string(),
            healthy: false,
            message: format!("check failed: {e}"),
        }));
    }
    if let Some(url) = &state.config.clickhouse_url {
        checks.push(connectors::check_clickhouse(url).unwrap_or_else(|e| HealthStatus {
            service: "ClickHouse".to_string(),
            healthy: false,
            message: format!("check failed: {e}"),
        }));
    }

    let postgres_healthy = checks.first().is_some_and(|c| c.healthy);
    let all_healthy = checks.iter().all(|c| c.healthy);
    let status_code = if postgres_healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status_code,
        Json(json!({
            "status": if all_healthy { "healthy" } else { "degraded" },
            "checks": checks,
        })),
    )
}

async fn scrape(
    State(state): State<AppState>,
    Json(req): Json<ScrapeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    if req.query.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "query is required"));
    }
    let location = req.location.clone().unwrap_or_default();
    let max_pages = req.max_pages.unwrap_or(2).clamp(1, 5);

    let job_id = state
        .importer
        .create_scrape_job("searxng", &req.query, &location)
        .await
        .map_err(|e| err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("job creation failed: {e}"),
        ))?;

    if let Err(e) = state.importer.mark_running(job_id).await {
        let _ = state.importer.fail(job_id, &format!("mark_running failed: {e}")).await;
        return Err(err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to start job: {e}"),
        ));
    }

    let mut scraper = SearxngBusinessScraper::new(
        state.searxng.clone(),
        EtlPipeline::new(),
        RateLimiter::new(),
    );

    match scraper.scrape(&req.query, &location, max_pages).await {
        Ok(records) => {
            let inserted = state
                .importer
                .insert_scraped_businesses(job_id, "searxng", &records)
                .await;
            if let Err(e) = state.importer.complete(job_id, inserted as i32).await {
                tracing::error!(?job_id, error = %e, "failed to mark job completed");
            }
            Ok((
                StatusCode::OK,
                Json(json!({
                    "job_id": job_id,
                    "status": "completed",
                    "business_count": inserted,
                })),
            ))
        }
        Err(e) => {
            let _ = state.importer.fail(job_id, &e.to_string()).await;
            tracing::error!(?job_id, error = %e, "scrape job failed");
            Err((
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "job_id": job_id,
                    "status": "failed",
                    "error": e.to_string(),
                })),
            ))
        }
    }
}
