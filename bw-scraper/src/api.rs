//! HTTP surface: health endpoints + POST /scrape + POST /enrich.

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
use crate::enrichment::EnrichmentEngine;
use crate::etl::EtlPipeline;
use crate::importer::PostgresImporter;
use crate::rate_limiter::RateLimiter;
use crate::scraper::SearxngBusinessScraper;
use crate::searxng::SearxngClient;
use sqlx::PgPool;
use sqlx::Row;
use uuid::Uuid;

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
        .route("/enrich", post(enrich))
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

/// Bounded enrichment run request. All fields are optional.
#[derive(Deserialize)]
pub struct EnrichRequest {
    /// Restrict the run to these businesses (still filtered by eligibility).
    #[serde(default)]
    pub business_ids: Option<Vec<Uuid>>,
    /// Max businesses to process in this run; defaults to 50 when omitted.
    #[serde(default)]
    pub limit: Option<i32>,
    /// Report the fields that would apply without writing (zero UPDATEs).
    #[serde(default)]
    pub dry_run: Option<bool>,
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

/// Default bound for an enrichment run when the client omits `limit`.
const ENRICH_DEFAULT_LIMIT: i32 = 50;

/// Eligible for enrichment: google_maps-sourced (joined by name, the
/// same convention the engine resolves its share-link from) with at
/// least one empty content field.
const SELECT_ELIGIBLE: &str = "SELECT b.id, b.name \
  FROM businesses b \
  JOIN scraped_businesses s \
    ON s.name = b.name AND s.source = 'google_maps' \
  WHERE (b.phone IS NULL OR b.website IS NULL OR b.description IS NULL \
     OR b.menu_url IS NULL OR b.image_url IS NULL OR b.review_count = 0)";

/// POST /enrich — bounded run of the fill-empty enrichment engine,
/// reported per business. Unauthenticated by design (operator endpoint).
async fn enrich(
    State(state): State<AppState>,
    Json(req): Json<EnrichRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let limit = req.limit.unwrap_or(ENRICH_DEFAULT_LIMIT);
    let dry_run = req.dry_run.unwrap_or(false);

    let rows = match &req.business_ids {
        Some(ids) => {
            let q =
                format!("{SELECT_ELIGIBLE} AND b.id = ANY($1::uuid[]) ORDER BY b.updated_at LIMIT $2");
            sqlx::query(&q)
                .bind(ids)
                .bind(limit)
                .fetch_all(&state.pool)
                .await
        }
        None => {
            let q = format!("{SELECT_ELIGIBLE} ORDER BY b.updated_at LIMIT $1");
            sqlx::query(&q)
                .bind(limit)
                .fetch_all(&state.pool)
                .await
        }
    };
    let rows = rows.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, format!("enrichment selection failed: {e}"))
    })?;

    let ids: Vec<Uuid> = rows.iter().map(|r| r.get::<Uuid, _>("id")).collect();
    let mut engine = EnrichmentEngine::new();
    let results = engine.enrich_batch(&state.pool, &ids, dry_run).await;

    let (mut enriched, mut skipped, mut failed) = (0_i32, 0_i32, 0_i32);
    let businesses: Vec<serde_json::Value> = results
        .iter()
        .map(|r| {
            if r.error.is_some() {
                failed += 1;
            } else if r.reason.is_some() {
                skipped += 1;
            } else {
                enriched += 1;
            }
            json!({
                "id": r.business_id,
                "name": r.business_name,
                "applied": r.applied.iter().map(|a| a.field).collect::<Vec<_>>(),
                "skipped": r.skipped.iter().copied().collect::<Vec<_>>(),
                "error": r.error,
            })
        })
        .collect();

    Ok((
        StatusCode::OK,
        Json(json!({
            "businesses": businesses,
            "summary": {
                "total": businesses.len(),
                "enriched": enriched,
                "skipped": skipped,
                "failed": failed,
            },
        })),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use std::io::{Read, Write};

    const FIXTURE_PLACE_JSON: &str =
        include_str!("../tests/fixtures/place-json/southern_kitchen.json");

    /// Compose Postgres pool; DB tests skip when unreachable.
    async fn test_pool() -> Result<PgPool, String> {
        let url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/black_owned".to_string());
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .map_err(|e| format!("connect failed: {e}"))
    }

    /// Shared fixture place-JSON server for the whole module: one stub
    /// answering every request with the fixture. Seeded source_ids are
    /// Google-shaped so they pass `is_google_share_link`; the engine's
    /// default client routes them through the `http_proxy` env var
    /// (set once, here) to the stub.
    static FIXTURE_STUB_PORT: std::sync::LazyLock<u16> = std::sync::LazyLock::new(|| {
        let listener =
            std::net::TcpListener::bind("127.0.0.1:0").expect("bind fixture listener");
        let port = listener.local_addr().expect("fixture address").port();
        let body = FIXTURE_PLACE_JSON.to_string();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = match stream {
                    Ok(stream) => stream,
                    Err(_) => break,
                };
                let mut head = Vec::new();
                let mut buf = [0u8; 8192];
                loop {
                    match stream.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            head.extend_from_slice(&buf[..n]);
                            if head.windows(4).any(|w| w == b"\r\n\r\n") {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });
        let proxy = format!("http://127.0.0.1:{port}");
        std::env::set_var("http_proxy", &proxy);
        std::env::set_var("HTTP_PROXY", &proxy);
        port
    });

    fn fixture_proxy_port() -> u16 {
        *FIXTURE_STUB_PORT
    }

    fn test_state(pool: &PgPool) -> AppState {
        AppState {
            pool: pool.clone(),
            config: Config {
                database_url: "postgresql://localhost/test".to_string(),
                searxng_url: "http://127.0.0.1:1".to_string(),
                host: "127.0.0.1".to_string(),
                port: 1,
                nats_url: None,
                redis_url: None,
                clickhouse_url: None,
                log_level: "info".to_string(),
            },
            importer: PostgresImporter::new(pool.clone()),
            searxng: SearxngClient::new("http://127.0.0.1:1"),
        }
    }

    /// Seed `count` eligible businesses (google_maps source, every content
    /// field empty) under `prefix`; returns their ids in seed order.
    async fn seed_eligible(pool: &PgPool, prefix: &str, count: i32) -> Vec<Uuid> {
        let email = format!("ac1-enrich-{}@example.com", Uuid::new_v4());
        let user_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, 'test', 'AC1 Enrich Test', 'admin')
                 RETURNING id",
            )
            .bind(&email)
            .fetch_one(pool)
            .await
            .expect("seed user inserts");
            row.get::<Uuid, _>("id")
        };

        let job_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO scrape_jobs (source, query, location)
                 VALUES ('ac1-test', 'ac1 enrich', 'Test')
                 RETURNING id",
            )
            .fetch_one(pool)
            .await
            .expect("seed scrape job");
            row.get::<Uuid, _>("id")
        };

        let mut ids = Vec::new();
        for i in 1..=count {
            let name = format!("{prefix} Business {i}");
            let id: Uuid = {
                let row = sqlx::query(
                    r#"INSERT INTO businesses
                       (owner_id, name, description, category_id, rating, review_count,
                        phone, website, social_urls)
                       VALUES ($1, $2, NULL, 'test-enrichment', 0, 0, NULL, NULL, NULL)
                       RETURNING id"#,
                )
                .bind(user_id)
                .bind(&name)
                .fetch_one(pool)
                .await
                .expect("seed business inserts");
                row.get::<Uuid, _>("id")
            };
            sqlx::query(
                "INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id)
                 VALUES ($1, 'google_maps', $2, $3)",
            )
            .bind(job_id)
            .bind(&name)
            .bind("http://maps.google.test/maps/place.json")
            .execute(pool)
            .await
            .expect("seed scraped_businesses row");
            ids.push(id);
        }
        ids
    }

    /// Delete this test family's rows (businesses + scraped_businesses).
    async fn cleanup_family(pool: &PgPool, prefix: &str) {
        let like = format!("{prefix} %");
        sqlx::query("DELETE FROM businesses WHERE name LIKE $1")
            .bind(&like)
            .execute(pool)
            .await
            .expect("cleanup businesses");
        sqlx::query("DELETE FROM scraped_businesses WHERE name LIKE $1")
            .bind(&like)
            .execute(pool)
            .await
            .expect("cleanup scraped businesses");
    }

    // AC1: POST /enrich {"limit": 5} over 10 eligible businesses enriches
    // at most 5; response is 200 with the pinned per-business + summary
    // shape, and exactly 5 rows are written.
    #[tokio::test]
    async fn test_enrich_limit_5_enriches_at_most_5() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP api enrich test (compose Postgres unavailable): {e}");
                return;
            }
        };
        fixture_proxy_port();
        cleanup_family(&pool, "AC1 Enrich Limit").await;

        let ids = seed_eligible(&pool, "AC1 Enrich Limit", 10).await;
        let state = test_state(&pool);

        let (status, Json(body)) = match enrich(
            State(state),
            Json(EnrichRequest {
                business_ids: Some(ids.clone()),
                limit: Some(5),
                dry_run: None,
            }),
        )
        .await
        {
            Ok(v) => v,
            Err((status, Json(body))) => {
                cleanup_family(&pool, "AC1 Enrich Limit").await;
                panic!("enrich endpoint errored: {status} {body}");
            }
        };

        assert_eq!(status, StatusCode::OK, "{body}");
        let summary = body
            .get("summary")
            .and_then(|v| v.as_object())
            .expect("summary object");
        assert_eq!(
            summary.get("total").and_then(|v| v.as_i64()),
            Some(5),
            "limit bounds the run: {body}"
        );
        assert_eq!(
            summary.get("enriched").and_then(|v| v.as_i64()),
            Some(5),
            "all selected businesses enrich: {body}"
        );
        assert_eq!(summary.get("skipped").and_then(|v| v.as_i64()), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(|v| v.as_i64()), Some(0), "{body}");

        let businesses = body
            .get("businesses")
            .and_then(|v| v.as_array())
            .expect("businesses array");
        assert_eq!(businesses.len(), 5, "{body}");
        for entry in businesses {
            assert!(entry.get("id").is_some(), "{body}");
            assert!(entry.get("name").is_some(), "{body}");
            let applied = entry.get("applied").and_then(|v| v.as_array()).expect("applied array");
            let fields: Vec<&str> = applied.iter().map(|f| f.as_str().unwrap_or_default()).collect();
            assert_eq!(
                fields,
                vec!["phone", "website", "description", "rating", "review_count", "social"],
                "fixture fills every empty field: {body}"
            );
            assert!(entry.get("skipped").and_then(|v| v.as_array()).is_some(), "{body}");
            assert!(
                entry.get("error").map(|v| v.is_null()).unwrap_or(false),
                "{body}"
            );
        }

        // Exactly 5 rows were written; the other 5 stay eligible for a later run.
        let filled: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM businesses WHERE name LIKE $1 AND phone IS NOT NULL",
        )
        .bind("AC1 Enrich Limit %")
        .fetch_one(&pool)
        .await
        .expect("count filled rows");
        assert_eq!(filled, 5, "exactly the limited selection was written");
        let untouched: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM businesses WHERE name LIKE $1 AND phone IS NULL",
        )
        .bind("AC1 Enrich Limit %")
        .fetch_one(&pool)
        .await
        .expect("count untouched rows");
        assert_eq!(untouched, 5, "five eligible businesses remain for a later run");

        cleanup_family(&pool, "AC1 Enrich Limit").await;
    }

    // AC1: default limit when omitted is 50. 51 eligible businesses
    // seeded; only 50 are processed.
    #[tokio::test]
    async fn test_enrich_default_limit_is_50() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP api enrich test (compose Postgres unavailable): {e}");
                return;
            }
        };
        fixture_proxy_port();
        cleanup_family(&pool, "AC1 Enrich Default").await;

        let ids = seed_eligible(&pool, "AC1 Enrich Default", 51).await;
        let state = test_state(&pool);

        let (status, Json(body)) = match enrich(
            State(state),
            Json(EnrichRequest {
                business_ids: Some(ids),
                limit: None,
                dry_run: None,
            }),
        )
        .await
        {
            Ok(v) => v,
            Err((status, Json(body))) => {
                cleanup_family(&pool, "AC1 Enrich Default").await;
                panic!("enrich endpoint errored: {status} {body}");
            }
        };

        assert_eq!(status, StatusCode::OK, "{body}");
        let summary = body
            .get("summary")
            .and_then(|v| v.as_object())
            .expect("summary object");
        assert_eq!(
            summary.get("total").and_then(|v| v.as_i64()),
            Some(50),
            "default limit is 50 when omitted: {body}"
        );
        assert_eq!(
            summary.get("enriched").and_then(|v| v.as_i64()),
            Some(50),
            "{body}"
        );

        let untouched: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM businesses WHERE name LIKE $1 AND phone IS NULL",
        )
        .bind("AC1 Enrich Default %")
        .fetch_one(&pool)
        .await
        .expect("count untouched rows");
        assert_eq!(untouched, 1, "one eligible business remains past the default limit");

        cleanup_family(&pool, "AC1 Enrich Default").await;
    }

    // AC1 scenario: dry_run=true reports the fields that would apply and
    // issues zero UPDATE statements against Postgres.
    #[tokio::test]
    async fn test_enrich_dry_run_performs_zero_writes() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP api enrich test (compose Postgres unavailable): {e}");
                return;
            }
        };
        fixture_proxy_port();
        cleanup_family(&pool, "AC1 Enrich DryRun").await;

        let ids = seed_eligible(&pool, "AC1 Enrich DryRun", 3).await;

        // Pre-state: every content field empty, timestamps captured.
        let before_rows = sqlx::query(
                "SELECT id, phone, review_count, updated_at
                 FROM businesses WHERE name LIKE $1 ORDER BY name",
            )
            .bind("AC1 Enrich DryRun %")
            .fetch_all(&pool)
            .await
            .expect("snapshot pre-state");
        let before: Vec<(Uuid, Option<String>, Option<i32>, chrono::DateTime<chrono::Utc>)> =
            before_rows
                .iter()
                .map(|r| {
                    (
                        r.get::<Uuid, _>("id"),
                        r.get::<Option<String>, _>("phone"),
                        r.get::<Option<i32>, _>("review_count"),
                        r.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
                    )
                })
                .collect();
        assert_eq!(before.len(), 3, "three rows seeded");
        for (_, phone, review_count, _) in &before {
            assert!(phone.is_none(), "seed rows start empty: {phone:?}");
            assert_eq!(*review_count, Some(0));
        }

        let state = test_state(&pool);
        let (status, Json(body)) = match enrich(
            State(state),
            Json(EnrichRequest {
                business_ids: Some(ids.clone()),
                limit: None,
                dry_run: Some(true),
            }),
        )
        .await
        {
            Ok(v) => v,
            Err((status, Json(body))) => {
                cleanup_family(&pool, "AC1 Enrich DryRun").await;
                panic!("enrich endpoint errored: {status} {body}");
            }
        };

        assert_eq!(status, StatusCode::OK, "{body}");
        let summary = body
            .get("summary")
            .and_then(|v| v.as_object())
            .expect("summary object");
        assert_eq!(summary.get("total").and_then(|v| v.as_i64()), Some(3), "{body}");
        assert_eq!(
            summary.get("enriched").and_then(|v| v.as_i64()),
            Some(3),
            "dry run reports the fields that would apply: {body}"
        );
        assert_eq!(summary.get("skipped").and_then(|v| v.as_i64()), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(|v| v.as_i64()), Some(0), "{body}");

        let businesses = body
            .get("businesses")
            .and_then(|v| v.as_array())
            .expect("businesses array");
        for entry in businesses {
            let applied = entry.get("applied").and_then(|v| v.as_array()).expect("applied array");
            let fields: Vec<&str> = applied.iter().map(|f| f.as_str().unwrap_or_default()).collect();
            assert_eq!(
                fields,
                vec!["phone", "website", "description", "rating", "review_count", "social"],
                "dry run lists every field that would apply: {body}"
            );
            let skipped = entry.get("skipped").and_then(|v| v.as_array()).expect("skipped array");
            assert!(skipped.is_empty(), "fully empty row skips nothing: {body}");
        }

        // Post-state: rows untouched — no content fields written and no
        // updated_at bump, proving zero UPDATE statements hit these rows.
        let after_rows = sqlx::query(
                "SELECT id, phone, review_count, updated_at
                 FROM businesses WHERE name LIKE $1 ORDER BY name",
            )
            .bind("AC1 Enrich DryRun %")
            .fetch_all(&pool)
            .await
            .expect("snapshot post-state");
        let after: Vec<(Uuid, Option<String>, Option<i32>, chrono::DateTime<chrono::Utc>)> =
            after_rows
                .iter()
                .map(|r| {
                    (
                        r.get::<Uuid, _>("id"),
                        r.get::<Option<String>, _>("phone"),
                        r.get::<Option<i32>, _>("review_count"),
                        r.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
                    )
                })
                .collect();
        assert_eq!(before, after, "dry run left every row untouched");

        cleanup_family(&pool, "AC1 Enrich DryRun").await;
    }

    // AC1 pin: zero eligible businesses in the selection -> 200 with
    // total:0 and an empty businesses array. Verified hermetically by
    // pointing business_ids at a fully-filled (ineligible) business so
    // the outcome does not depend on shared dev-DB contents.
    #[tokio::test]
    async fn test_enrich_empty_selection_returns_empty_report() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP api enrich test (compose Postgres unavailable): {e}");
                return;
            }
        };
        cleanup_family(&pool, "AC1 Enrich Empty").await;

        // Fully-filled business: no empty content field, so ineligible.
        let email = format!("ac1-empty-{}@example.com", Uuid::new_v4());
        let user_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, 'test', 'AC1 Enrich Test', 'admin')
                 RETURNING id",
            )
            .bind(&email)
            .fetch_one(&pool)
            .await
            .expect("seed user inserts");
            row.get::<Uuid, _>("id")
        };
        let job_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO scrape_jobs (source, query, location)
                 VALUES ('ac1-test', 'ac1 enrich', 'Test')
                 RETURNING id",
            )
            .fetch_one(&pool)
            .await
            .expect("seed scrape job");
            row.get::<Uuid, _>("id")
        };
        let name = "AC1 Enrich Empty Filled";
        let filled_id: Uuid = {
            let row = sqlx::query(
                r#"INSERT INTO businesses
                   (owner_id, name, description, category_id, rating, review_count,
                    phone, website, menu_url, image_url, social_urls)
                   VALUES ($1, $2, 'Filled description', 'test-enrichment', 4.0, 42,
                           '+15550004444', 'https://filled.example.com',
                           'https://filled.example.com/menu',
                           'https://filled.example.com/img.jpg', '[]')
                   RETURNING id"#,
            )
            .bind(user_id)
            .bind(name)
            .fetch_one(&pool)
            .await
            .expect("seed filled business");
            row.get::<Uuid, _>("id")
        };
        sqlx::query(
            "INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id)
             VALUES ($1, 'google_maps', $2, $3)",
        )
        .bind(job_id)
        .bind(name)
        .bind("http://maps.google.test/maps/place.json")
        .execute(&pool)
        .await
        .expect("seed filled source row");

        let state = test_state(&pool);
        let (status, Json(body)) = match enrich(
            State(state),
            Json(EnrichRequest {
                business_ids: Some(vec![filled_id]),
                limit: None,
                dry_run: None,
            }),
        )
        .await
        {
            Ok(v) => v,
            Err((status, Json(body))) => {
                cleanup_family(&pool, "AC1 Enrich Empty").await;
                panic!("enrich endpoint errored: {status} {body}");
            }
        };

        assert_eq!(status, StatusCode::OK, "{body}");
        let summary = body
            .get("summary")
            .and_then(|v| v.as_object())
            .expect("summary object");
        assert_eq!(
            summary.get("total").and_then(|v| v.as_i64()),
            Some(0),
            "empty selection reports total 0: {body}"
        );
        assert_eq!(summary.get("enriched").and_then(|v| v.as_i64()), Some(0), "{body}");
        assert_eq!(summary.get("skipped").and_then(|v| v.as_i64()), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(|v| v.as_i64()), Some(0), "{body}");
        let businesses = body
            .get("businesses")
            .and_then(|v| v.as_array())
            .expect("businesses array");
        assert!(businesses.is_empty(), "no businesses in an empty report: {body}");

        cleanup_family(&pool, "AC1 Enrich Empty").await;
    }

    // QA coverage (LOC-0078-AC1): the Gherkin's literal request shapes
    // ({"limit": 5}, {"dry_run": true}, {}) omit business_ids, exercising
    // the unfiltered full-table selection branch the acceptance tests
    // never reach (they pin hermetic id-scoped runs). Seeding this family
    // guarantees >= 50 eligible rows, so the default limit fully binds the
    // run; dry_run keeps the test write-free on the shared compose
    // Postgres, so rows selected outside this family can only affect the
    // enriched/skipped/failed split, never the totals or the DB.
    #[tokio::test]
    async fn test_enrich_unfiltered_dry_run_defaults_to_50() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP api enrich test (compose Postgres unavailable): {e}");
                return;
            }
        };
        fixture_proxy_port();
        cleanup_family(&pool, "AC1 QA Unfiltered").await;

        seed_eligible(&pool, "AC1 QA Unfiltered", 100).await;
        let state = test_state(&pool);

        let (status, Json(body)) = match enrich(
            State(state),
            Json(EnrichRequest {
                business_ids: None,
                limit: None,
                dry_run: Some(true),
            }),
        )
        .await
        {
            Ok(v) => v,
            Err((status, Json(body))) => {
                cleanup_family(&pool, "AC1 QA Unfiltered").await;
                panic!("enrich endpoint errored: {status} {body}");
            }
        };

        assert_eq!(status, StatusCode::OK, "{body}");
        let summary = body
            .get("summary")
            .and_then(|v| v.as_object())
            .expect("summary object");
        assert_eq!(
            summary.get("total").and_then(|v| v.as_i64()),
            Some(50),
            "unfiltered selection binds to the default limit: {body}"
        );
        let enriched = summary.get("enriched").and_then(|v| v.as_i64()).unwrap_or(-1);
        let skipped = summary.get("skipped").and_then(|v| v.as_i64()).unwrap_or(-1);
        let failed = summary.get("failed").and_then(|v| v.as_i64()).unwrap_or(-1);
        assert_eq!(
            enriched + skipped + failed,
            50,
            "every selected row is classified exactly once: {body}"
        );

        let businesses = body
            .get("businesses")
            .and_then(|v| v.as_array())
            .expect("businesses array");
        assert_eq!(businesses.len(), 50, "{body}");
        for entry in businesses {
            assert!(entry.get("id").is_some(), "{body}");
            assert!(entry.get("name").is_some(), "{body}");
            assert!(
                entry.get("applied").and_then(|v| v.as_array()).is_some(),
                "{body}"
            );
            assert!(
                entry.get("skipped").and_then(|v| v.as_array()).is_some(),
                "{body}"
            );
            assert!(entry.get("error").is_some(), "{body}");
        }

        // Dry run: nothing written in this family.
        let filled: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM businesses WHERE name LIKE $1 AND phone IS NOT NULL",
        )
        .bind("AC1 QA Unfiltered %")
        .fetch_one(&pool)
        .await
        .expect("count filled rows");
        assert_eq!(filled, 0, "unfiltered dry run wrote nothing");

        cleanup_family(&pool, "AC1 QA Unfiltered").await;
    }

    // AC2: targeted run respects ids. Given b-1, b-2, b-3 all eligible,
    // POST /enrich naming only b-1 and b-2 processes exactly those two
    // (summary counts reflect the two) and leaves b-3 untouched: no
    // content field written, updated_at unchanged.
    #[tokio::test]
    async fn test_enrich_targeted_run_excludes_unlisted_ids() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP api enrich test (compose Postgres unavailable): {e}");
                return;
            }
        };
        fixture_proxy_port();
        cleanup_family(&pool, "AC2 Enrich Target").await;

        let ids = seed_eligible(&pool, "AC2 Enrich Target", 3).await;
        let (b1, b2, b3) = (ids[0], ids[1], ids[2]);

        // Pre-state snapshot of the excluded business b-3: every content
        // field the engine can write, plus updated_at.
        let before_rows = sqlx::query(
            r#"SELECT phone, website, description, rating::text AS rating,
                      review_count, social_urls::text AS social_urls, updated_at
               FROM businesses WHERE id = $1"#,
        )
        .bind(b3)
        .fetch_one(&pool)
        .await
        .expect("snapshot b-3 pre-state");
        let before = (
            before_rows.get::<Option<String>, _>("phone"),
            before_rows.get::<Option<String>, _>("website"),
            before_rows.get::<Option<String>, _>("description"),
            before_rows.get::<Option<String>, _>("rating"),
            before_rows.get::<Option<i32>, _>("review_count"),
            before_rows.get::<Option<String>, _>("social_urls"),
            before_rows.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
        );
        assert!(before.0.is_none(), "seed rows start with empty phone");

        let state = test_state(&pool);
        let (status, Json(body)) = match enrich(
            State(state),
            Json(EnrichRequest {
                business_ids: Some(vec![b1, b2]),
                limit: None,
                dry_run: None,
            }),
        )
        .await
        {
            Ok(v) => v,
            Err((status, Json(body))) => {
                cleanup_family(&pool, "AC2 Enrich Target").await;
                panic!("enrich endpoint errored: {status} {body}");
            }
        };

        assert_eq!(status, StatusCode::OK, "{body}");

        // Only b-1 and b-2 appear in the report; b-3 does not.
        let businesses = body
            .get("businesses")
            .and_then(|v| v.as_array())
            .expect("businesses array");
        assert_eq!(
            businesses.len(),
            2,
            "report holds exactly the two requested businesses: {body}"
        );
        let reported_ids: std::collections::BTreeSet<String> = businesses
            .iter()
            .map(|e| {
                e.get("id")
                    .and_then(|v| v.as_str())
                    .expect("report entry has id")
                    .to_string()
            })
            .collect();
        assert!(reported_ids.contains(&b1.to_string()), "b-1 in report: {body}");
        assert!(reported_ids.contains(&b2.to_string()), "b-2 in report: {body}");
        assert!(
            !reported_ids.contains(&b3.to_string()),
            "b-3 must not appear in the report: {body}"
        );

        // Summary counts reflect the two.
        let summary = body
            .get("summary")
            .and_then(|v| v.as_object())
            .expect("summary object");
        assert_eq!(
            summary.get("total").and_then(|v| v.as_i64()),
            Some(2),
            "summary total is the two requested: {body}"
        );
        assert_eq!(
            summary.get("enriched").and_then(|v| v.as_i64()),
            Some(2),
            "{body}"
        );
        assert_eq!(summary.get("skipped").and_then(|v| v.as_i64()), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(|v| v.as_i64()), Some(0), "{body}");

        // Both requested businesses were actually written...
        let written: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM businesses WHERE id = ANY($1::uuid[]) AND phone IS NOT NULL",
        )
        .bind(vec![b1, b2])
        .fetch_one(&pool)
        .await
        .expect("count written rows");
        assert_eq!(written, 2, "both requested businesses were enriched");

        // ...and b-3 remains unchanged: no field written, updated_at untouched.
        let after_rows = sqlx::query(
            r#"SELECT phone, website, description, rating::text AS rating,
                      review_count, social_urls::text AS social_urls, updated_at
               FROM businesses WHERE id = $1"#,
        )
        .bind(b3)
        .fetch_one(&pool)
        .await
        .expect("snapshot b-3 post-state");
        let after = (
            after_rows.get::<Option<String>, _>("phone"),
            after_rows.get::<Option<String>, _>("website"),
            after_rows.get::<Option<String>, _>("description"),
            after_rows.get::<Option<String>, _>("rating"),
            after_rows.get::<Option<i32>, _>("review_count"),
            after_rows.get::<Option<String>, _>("social_urls"),
            after_rows.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
        );
        assert_eq!(
            after, before,
            "b-3 unchanged: no field written, updated_at untouched"
        );

        cleanup_family(&pool, "AC2 Enrich Target").await;
    }
}
