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
        .route("/locations", post(locations))
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
            let count = i32::try_from(inserted).unwrap_or(i32::MAX);
            if let Err(e) = state.importer.complete(job_id, count).await {
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

/// Upper bound for a single enrichment run; a request `limit` must fall
/// inside `1..=ENRICH_MAX_LIMIT` or the endpoint rejects it with 400.
const ENRICH_MAX_LIMIT: i32 = 500;

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
    if !(1..=ENRICH_MAX_LIMIT).contains(&limit) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            format!("limit must be between 1 and {ENRICH_MAX_LIMIT}, got {limit}"),
        ));
    }
    let dry_run = req.dry_run.unwrap_or(false);

    let rows = if let Some(ids) = &req.business_ids {
        let q =
            format!("{SELECT_ELIGIBLE} AND b.id = ANY($1::uuid[]) ORDER BY b.updated_at LIMIT $2");
        sqlx::query(&q)
            .bind(ids)
            .bind(limit)
            .fetch_all(&state.pool)
            .await
    } else {
        let q = format!("{SELECT_ELIGIBLE} ORDER BY b.updated_at LIMIT $1");
        sqlx::query(&q)
            .bind(limit)
            .fetch_all(&state.pool)
            .await
    };
    let rows = rows.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, format!("enrichment selection failed: {e}"))
    })?;

    let ids: Vec<Uuid> = rows.iter().map(|r| r.get::<Uuid, _>("id")).collect();
    let mut engine = EnrichmentEngine::new(&state.config.searxng_url);
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
                "skipped": r.skipped.clone(),
                "locations": r.locations,
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

/// Default bound for a location-discovery run when the client omits `limit`.
const LOCATIONS_DEFAULT_LIMIT: i32 = 25;

/// Upper bound for a single location-discovery run.
const LOCATIONS_MAX_LIMIT: i32 = 500;

/// Eligible for location discovery: `google_maps`-sourced (the same join
/// convention the enrichment engine resolves share-links from). Unlike
/// `/enrich`, there is no content-field gate: discovery also runs on
/// fully enriched businesses.
const SELECT_LOCATIONS: &str = "SELECT b.id, b.name \
  FROM businesses b \
  JOIN scraped_businesses s \
    ON s.name = b.name AND s.source = 'google_maps'";

/// Location-discovery run request. All fields optional.
#[derive(Deserialize)]
pub struct LocationsRequest {
    /// Restrict the run to these businesses.
    #[serde(default)]
    pub business_ids: Option<Vec<Uuid>>,
    /// Max businesses to process; defaults to 25 when omitted.
    #[serde(default)]
    pub limit: Option<i32>,
    /// Report discovered locations without geocoding or writing rows.
    #[serde(default)]
    pub dry_run: Option<bool>,
}

/// POST /locations — discover secondary physical locations for eligible
/// businesses from their `SearXNG` results, geocode them via Nominatim,
/// and write them to `business_locations` (atomic dedupe). Also ensures
/// every processed business has a primary location row. Unauthenticated
/// by design (operator endpoint, like `/enrich`).
async fn locations(
    State(state): State<AppState>,
    Json(req): Json<LocationsRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let limit = req.limit.unwrap_or(LOCATIONS_DEFAULT_LIMIT);
    if !(1..=LOCATIONS_MAX_LIMIT).contains(&limit) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            format!("limit must be between 1 and {LOCATIONS_MAX_LIMIT}, got {limit}"),
        ));
    }
    let dry_run = req.dry_run.unwrap_or(false);

    let rows = if let Some(ids) = &req.business_ids {
        let q = format!("{SELECT_LOCATIONS} AND b.id = ANY($1::uuid[]) ORDER BY b.updated_at LIMIT $2");
        sqlx::query(&q)
            .bind(ids)
            .bind(limit)
            .fetch_all(&state.pool)
            .await
    } else {
        let q = format!("{SELECT_LOCATIONS} ORDER BY b.updated_at LIMIT $1");
        sqlx::query(&q)
            .bind(limit)
            .fetch_all(&state.pool)
            .await
    };
    let rows = rows.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, format!("location selection failed: {e}"))
    })?;

    let ids: Vec<Uuid> = rows.iter().map(|r| r.get::<Uuid, _>("id")).collect();
    let mut engine = EnrichmentEngine::new(&state.config.searxng_url);
    if let Some(base) = &state.config.nominatim_url {
        engine = engine.with_nominatim(base);
    }

    let (mut processed, mut added, mut failed) = (0_i32, 0_i32, 0_i32);
    let mut businesses: Vec<serde_json::Value> = Vec::with_capacity(ids.len());
    for id in ids {
        match engine.discover_business_locations(&state.pool, id, dry_run).await {
            Ok(outcome) => {
                processed += 1;
                let count =
                    i32::try_from(outcome.locations.iter().filter(|l| l.inserted).count())
                        .unwrap_or(i32::MAX);
                added += count;
                businesses.push(json!({
                    "id": id,
                    "name": outcome.business_name,
                    "locations": outcome.locations,
                    "primary_added": outcome.primary_added,
                    "notes": outcome.notes,
                    "error": null,
                }));
            }
            Err(e) => {
                failed += 1;
                businesses.push(json!({
                    "id": id,
                    "name": null,
                    "locations": [],
                    "primary_added": false,
                    "notes": [],
                    "error": e,
                }));
            }
        }
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "businesses": businesses,
            "summary": {
                "total": businesses.len(),
                "processed": processed,
                "locations_added": added,
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
    use axum::body::Body;
    use axum::http::Request;
    use crate::rate_limiter::RateLimiterConfig;

    /// `SearXNG` search-response fixture: one result whose URL is the
    /// website and whose snippet carries the description and a US phone
    /// number (extracted by the ETL regex).
    const FIXTURE_SEARXNG_RESULT: &str = r#"{
        "query": "ac fixture",
        "number_of_results": 1,
        "results": [
            {
                "url": "https://ac-fixture.example/",
                "title": "AC Fixture Kitchen",
                "content": "AC fixture kitchen and bar. Call (404) 555-0134.",
                "engine": "searxng",
                "score": 1.0
            }
        ],
        "answers": [],
        "infoboxes": [],
        "suggestions": [],
        "articles": []
    }"#;

    /// `SearXNG` fixture for the AC12 location-discovery test: one result
    /// whose title carries the seeded business name + branch label and
    /// whose snippet carries a fully-matched US address.
    const LOC_DISCOVERY_SEARXNG: &str = r#"{
        "query": "ac12",
        "number_of_results": 1,
        "results": [
            {
                "url": "https://opentable.test/r/ac12-loc-bistro-west",
                "title": "AC12 Loc Run Business 1 - West, Springfield, IL - OpenTable",
                "content": "421 West Ave, Ste 2, Springfield, IL 62704 - About this restaurant",
                "engine": "opentable",
                "score": 1.0
            }
        ],
        "unresponsive_engines": []
    }"#;

    /// `Nominatim` geocode fixture for the AC12 location-discovery test:
    /// one hit ~14 km from the seeded primary so the 300 m proximity merge
    /// does not mask the insert.
    const LOC_DISCOVERY_NOMINATIM: &str = r#"[
        {
            "place_id": 1,
            "osm_type": "way",
            "osm_id": 1,
            "lat": "39.797000",
            "lon": "-89.647000",
            "display_name": "421 West Ave, Springfield, IL"
        }
    ]"#;

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

    /// Shared fixture `SearXNG` server for the whole module: one stub
    /// answering every request with the `SearXNG` JSON fixture, except
    /// paths under `/ac12-search/` and `/ac12-nominatim/`, which serve the
    /// location-discovery test's own fixtures. Seeded `source_ids` are
    /// Google-shaped so they pass `is_google_share_link` (gate only — never
    /// fetched); the engine's base URLs are routed through the `http_proxy`
    /// env var (set once, here) to the stub.
    static FIXTURE_STUB_PORT: std::sync::LazyLock<u16> = std::sync::LazyLock::new(|| {
        let listener =
            std::net::TcpListener::bind("127.0.0.1:0").expect("bind fixture listener");
        let port = listener.local_addr().expect("fixture address").port();
        let body = FIXTURE_SEARXNG_RESULT.to_string();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else {
                    break;
                };
                let mut head = Vec::new();
                let mut buf = [0u8; 8192];
                loop {
                    match stream.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            head.extend_from_slice(&buf[..n]);
                            if head.windows(4).any(|w| w == b"\r\n\r\n") {
                                break;
                            }
                        }
                    }
                }
                // AC3 bookkeeping: record the distinct /search?q= paths for
                // the AC3 Enrich 500 family. A transport-level retry
                // re-sends the same query, so the distinct count stays
                // exact under concurrent load and proves one logical
                // SearXNG lookup per business.
                let path = stub_request_path(&head);
                if let Some(p) = &path {
                    if p.starts_with("/search") && p.contains("AC3+Enrich+500") {
                        AC3_STUB_PATHS.lock().insert(p.clone());
                    }
                }
                // The AC12 location-discovery test routes unroutable bases
                // through this proxy and selects its fixtures by path
                // prefix; every other request keeps the shared fixture.
                let body = match path.as_deref() {
                    Some(p) if p.starts_with("/ac12-search/") => LOC_DISCOVERY_SEARXNG,
                    Some(p) if p.starts_with("/ac12-nominatim/") => LOC_DISCOVERY_NOMINATIM,
                    _ => body.as_str(),
                };
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

    /// AC3 bookkeeping: distinct `/ac3-` fetch paths the stub served.
    /// Stays AC3-exclusive because no other test seeds that path prefix.
    static AC3_STUB_PATHS: std::sync::LazyLock<parking_lot::Mutex<std::collections::HashSet<String>>> =
        std::sync::LazyLock::new(|| parking_lot::Mutex::new(std::collections::HashSet::new()));

    /// Path component of the first request line in a captured request head.
    /// Proxy-routed requests arrive in absolute form
    /// (`GET http://host/path HTTP/1.1`), so strip scheme+host to the path.
    fn stub_request_path(head: &[u8]) -> Option<String> {
        let text = String::from_utf8_lossy(head);
        let first_line = text.lines().next()?;
        let target = first_line.split_whitespace().nth(1)?;
        let path = match target.rsplit_once("://") {
            Some((_, rest)) => rest.find('/').map_or("", |i| &rest[i..]),
            None => target,
        };
        Some(path.to_string())
    }

    /// Serializes the AC3 tests that assert on the shared fixture stub, so
    /// one test's batch cannot queue behind another's and skew timing
    /// assertions.
    static AC3_STUB_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> = std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));

    /// `AppState` with an unconnected lazy pool — enough for handler paths
    /// that reject the request before touching the database (AC3
    /// validation tests are true unit tests: no compose Postgres needed).
    fn lazy_state() -> AppState {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(2)
            .connect_lazy("postgresql://localhost/test")
            .expect("lazy pool builds");
        test_state(&pool)
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
                nominatim_url: None,
            },
            importer: PostgresImporter::new(pool.clone()),
            searxng: SearxngClient::new("http://127.0.0.1:1"),
        }
    }

    /// Seed `count` eligible businesses (`google_maps` source, every content
    /// field empty) under `prefix` with the default fixture `source_id`;
    /// returns their ids in seed order.
    async fn seed_eligible(pool: &PgPool, prefix: &str, count: i32) -> Vec<Uuid> {
        seed_eligible_source(
            pool,
            prefix,
            count,
            |_i| "http://maps.google.test/maps/place.json".to_string(),
        )
        .await
    }

    /// Like `seed_eligible`, but with per-business `source_ids` so a test
    /// can correlate the stub's observed fetch paths with businesses.
    async fn seed_eligible_source(
        pool: &PgPool,
        prefix: &str,
        count: i32,
        source_id_for: impl Fn(i32) -> String,
    ) -> Vec<Uuid> {
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
                    r"INSERT INTO businesses
                       (owner_id, name, description, category_id, rating, review_count,
                        phone, website, social_urls)
                       VALUES ($1, $2, NULL, 'test-enrichment', 0, 0, NULL, NULL, NULL)
                       RETURNING id",
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
            .bind(source_id_for(i))
            .execute(pool)
            .await
            .expect("seed scraped_businesses row");
            ids.push(id);
        }
        ids
    }

    /// Delete this test family's rows (businesses + `scraped_businesses`).
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
            summary.get("total").and_then(serde_json::Value::as_i64),
            Some(5),
            "limit bounds the run: {body}"
        );
        assert_eq!(
            summary.get("enriched").and_then(serde_json::Value::as_i64),
            Some(5),
            "all selected businesses enrich: {body}"
        );
        assert_eq!(summary.get("skipped").and_then(serde_json::Value::as_i64), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(serde_json::Value::as_i64), Some(0), "{body}");

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
                vec!["phone", "website", "description"],
                "SearXNG fixture fills exactly its three fields: {body}"
            );
            assert!(entry.get("skipped").and_then(|v| v.as_array()).is_some(), "{body}");
            assert!(
                entry.get("error").is_some_and(serde_json::Value::is_null),
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
            summary.get("total").and_then(serde_json::Value::as_i64),
            Some(50),
            "default limit is 50 when omitted: {body}"
        );
        assert_eq!(
            summary.get("enriched").and_then(serde_json::Value::as_i64),
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

    /// Content snapshot of a business row: the fields a dry run must not
    /// touch, plus `updated_at` so a stray UPDATE is detectable.
    #[derive(Debug, PartialEq)]
    struct RowSnapshot {
        id: Uuid,
        phone: Option<String>,
        review_count: Option<i32>,
        updated_at: chrono::DateTime<chrono::Utc>,
    }

    async fn row_snapshot(pool: &PgPool, name_pattern: &str) -> Vec<RowSnapshot> {
        let rows = sqlx::query(
            "SELECT id, phone, review_count, updated_at
             FROM businesses WHERE name LIKE $1 ORDER BY name",
        )
        .bind(name_pattern)
        .fetch_all(pool)
        .await
        .expect("snapshot rows read back");
        rows.iter()
            .map(|row| RowSnapshot {
                id: row.get::<Uuid, _>("id"),
                phone: row.get("phone"),
                review_count: row.get("review_count"),
                updated_at: row.get("updated_at"),
            })
            .collect()
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
        let before = row_snapshot(&pool, "AC1 Enrich DryRun %").await;
        assert_eq!(before.len(), 3, "three rows seeded");
        for snapshot in &before {
            assert!(
                snapshot.phone.is_none(),
                "seed rows start empty: {:?}",
                snapshot.phone
            );
            assert_eq!(snapshot.review_count, Some(0));
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
        assert_eq!(summary.get("total").and_then(serde_json::Value::as_i64), Some(3), "{body}");
        assert_eq!(
            summary.get("enriched").and_then(serde_json::Value::as_i64),
            Some(3),
            "dry run reports the fields that would apply: {body}"
        );
        assert_eq!(summary.get("skipped").and_then(serde_json::Value::as_i64), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(serde_json::Value::as_i64), Some(0), "{body}");

        let businesses = body
            .get("businesses")
            .and_then(|v| v.as_array())
            .expect("businesses array");
        for entry in businesses {
            let applied = entry.get("applied").and_then(|v| v.as_array()).expect("applied array");
            let fields: Vec<&str> = applied.iter().map(|f| f.as_str().unwrap_or_default()).collect();
            assert_eq!(
                fields,
                vec!["phone", "website", "description"],
                "SearXNG lookup supplies exactly these fields: {body}"
            );
            let skipped = entry.get("skipped").and_then(|v| v.as_array()).expect("skipped array");
            assert!(skipped.is_empty(), "fully empty row skips nothing: {body}");
        }

        // Post-state: rows untouched — no content fields written and no
        // updated_at bump, proving zero UPDATE statements hit these rows.
        let after = row_snapshot(&pool, "AC1 Enrich DryRun %").await;
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
                r"INSERT INTO businesses
                   (owner_id, name, description, category_id, rating, review_count,
                    phone, website, menu_url, image_url, social_urls)
                   VALUES ($1, $2, 'Filled description', 'test-enrichment', 4.0, 42,
                           '+15550004444', 'https://filled.example.com',
                           'https://filled.example.com/menu',
                           'https://filled.example.com/img.jpg', '[]')
                   RETURNING id",
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
            summary.get("total").and_then(serde_json::Value::as_i64),
            Some(0),
            "empty selection reports total 0: {body}"
        );
        assert_eq!(summary.get("enriched").and_then(serde_json::Value::as_i64), Some(0), "{body}");
        assert_eq!(summary.get("skipped").and_then(serde_json::Value::as_i64), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(serde_json::Value::as_i64), Some(0), "{body}");
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
            summary.get("total").and_then(serde_json::Value::as_i64),
            Some(50),
            "unfiltered selection binds to the default limit: {body}"
        );
        let enriched = summary.get("enriched").and_then(serde_json::Value::as_i64).unwrap_or(-1);
        let skipped = summary.get("skipped").and_then(serde_json::Value::as_i64).unwrap_or(-1);
        let failed = summary.get("failed").and_then(serde_json::Value::as_i64).unwrap_or(-1);
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

    /// Full content state of one business row: every field the engine can
    /// write, plus `updated_at` so a stray UPDATE is detectable.
    #[derive(Debug, PartialEq)]
    struct BusinessState {
        phone: Option<String>,
        website: Option<String>,
        description: Option<String>,
        rating: Option<String>,
        review_count: Option<i32>,
        social_urls: Option<String>,
        updated_at: chrono::DateTime<chrono::Utc>,
    }

    async fn business_state(pool: &PgPool, business_id: Uuid) -> BusinessState {
        let row = sqlx::query(
            "SELECT phone, website, description, rating::text AS rating,
                     review_count, social_urls::text AS social_urls, updated_at
              FROM businesses WHERE id = $1",
        )
        .bind(business_id)
        .fetch_one(pool)
        .await
        .expect("business state snapshot");
        BusinessState {
            phone: row.get("phone"),
            website: row.get("website"),
            description: row.get("description"),
            rating: row.get("rating"),
            review_count: row.get("review_count"),
            social_urls: row.get("social_urls"),
            updated_at: row.get("updated_at"),
        }
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
        let before = business_state(&pool, b3).await;
        assert!(before.phone.is_none(), "seed rows start with empty phone");

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
            summary.get("total").and_then(serde_json::Value::as_i64),
            Some(2),
            "summary total is the two requested: {body}"
        );
        assert_eq!(
            summary.get("enriched").and_then(serde_json::Value::as_i64),
            Some(2),
            "{body}"
        );
        assert_eq!(summary.get("skipped").and_then(serde_json::Value::as_i64), Some(0), "{body}");
        assert_eq!(summary.get("failed").and_then(serde_json::Value::as_i64), Some(0), "{body}");

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
        let after = business_state(&pool, b3).await;
        assert_eq!(
            after, before,
            "b-3 unchanged: no field written, updated_at untouched"
        );

        cleanup_family(&pool, "AC2 Enrich Target").await;
    }

    // AC3: POST /enrich {"limit": 0} -> 400 with an error describing the
    // valid range. Validation runs before any DB access, so the lazy pool
    // is never touched.
    #[tokio::test]
    async fn test_enrich_limit_zero_rejected_with_valid_range() {
        let state = lazy_state();
        let Err((status, Json(body))) = enrich(
            State(state),
            Json(EnrichRequest {
                business_ids: None,
                limit: Some(0),
                dry_run: None,
            }),
        )
        .await
        else {
            panic!("limit 0 must be rejected with 400, got Ok");
        };
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "limit 0 is out of range: {body}"
        );
        let msg = body.get("error").and_then(|v| v.as_str()).unwrap_or("");
        assert!(
            msg.contains("between 1 and 500"),
            "error must describe the valid range: {body}"
        );
    }

    // AC3: limits outside 1..=500 (negative or above the cap) are
    // rejected with 400 before any selection happens.
    #[tokio::test]
    async fn test_enrich_limit_out_of_range_rejected() {
        for limit in [i32::MIN, -1, 501, i32::MAX] {
            let state = lazy_state();
            let Err((status, Json(body))) = enrich(
                State(state),
                Json(EnrichRequest {
                    business_ids: None,
                    limit: Some(limit),
                    dry_run: None,
                }),
            )
            .await
            else {
                panic!("limit {limit} must be rejected with 400, got Ok");
            };
            assert_eq!(
                status,
                StatusCode::BAD_REQUEST,
                "limit {limit} is out of range: {body}"
            );
        }
    }

    // AC3: the boundaries 1 and 500 pass validation. The lazy pool means
    // the run then fails at selection (or, if a local `test` database
    // happens to exist, succeeds empty) — anything but 400 proves the
    // range check let the boundary values through.
    #[tokio::test]
    async fn test_enrich_limit_boundaries_pass_validation() {
        for limit in [1, 500] {
            let state = lazy_state();
            let res = enrich(
                State(state),
                Json(EnrichRequest {
                    business_ids: None,
                    limit: Some(limit),
                    dry_run: None,
                }),
            )
            .await;
            match res {
                Ok((status, _)) => assert_eq!(status, StatusCode::OK, "limit {limit} accepted"),
                Err((status, Json(body))) => assert_ne!(
                    status,
                    StatusCode::BAD_REQUEST,
                    "limit {limit} passed validation but was rejected: {body}"
                ),
            }
        }
    }

    // AC3: a malformed JSON body on POST /enrich is rejected with 400 by
    // axum's Json extractor, before the handler runs.
    #[tokio::test]
    async fn test_enrich_malformed_json_returns_400() {
        let state = lazy_state();
        for body in ["{not json", "{'limit': oops}", "{\"limit\": 5"] {
            let app = router(state.clone());
            let req = Request::builder()
                .method("POST")
                .uri("/enrich")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .expect("request builds");
            let res = tower::ServiceExt::oneshot(app, req)
                .await
                .expect("router responds");
            assert_eq!(
                res.status(),
                StatusCode::BAD_REQUEST,
                "malformed body must yield 400: {body}"
            );
        }
    }

    // AC3: every external fetch goes through the engine's rate limiter.
    // An injected 100ms limiter must delay each fetch after the first,
    // so 3 sequential fetches take >= 200ms — and far less than the
    // production 2s minimum, proving the injected limiter is in the loop.
    #[tokio::test]
    async fn test_enrich_fetch_goes_through_rate_limiter() {
        let _guard = AC3_STUB_LOCK.lock().await;
        fixture_proxy_port();
        let mut engine = EnrichmentEngine::with_limiter(
            "http://searxng.test",
            RateLimiter::with_config(RateLimiterConfig {
                min_delay_ms: 100,
                max_jitter_ms: 0,
            }),
        );
        let t0 = std::time::Instant::now();
        for _ in 0..3 {
            let place = engine
                .fetch_place_data("ac limiter business", "")
                .await
                .expect("lookup succeeds via the guarded path");
            assert!(place.is_some(), "fixture stub answers");
        }
        let elapsed = t0.elapsed();
        assert!(
            elapsed >= std::time::Duration::from_millis(200),
            "3 fetches through a 100ms limiter must spend >= 200ms on limiter waits, took {elapsed:?}"
        );
        assert!(
            elapsed < std::time::Duration::from_secs(2),
            "injected 100ms limiter used, not the production 2s one: {elapsed:?}"
        );
    }

    // AC3: a 500-business run completes with every external fetch going
    // through the engine's single guarded path (robots check + rate
    // limiter + UA rotation — no direct reqwest call bypasses them). A
    // zero-delay injected limiter keeps the run fast; the stub's distinct
    // /search?q=AC3+Enrich+500 path set proves one lookup per business.
    #[tokio::test]
    async fn test_enrich_500_run_all_fetches_go_through_guarded_path() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP api enrich test (compose Postgres unavailable): {e}");
                return;
            }
        };
        let _guard = AC3_STUB_LOCK.lock().await;
        fixture_proxy_port();
        cleanup_family(&pool, "AC3 Enrich 500").await;

        let ids = seed_eligible_source(&pool, "AC3 Enrich 500", 500, |i| {
            format!("http://maps.google.test/ac3-500-run/b{i}.json")
        })
        .await;
        assert_eq!(ids.len(), 500, "500 eligible businesses seeded");

        let mut engine = EnrichmentEngine::with_limiter(
            "http://searxng.test",
            RateLimiter::with_config(RateLimiterConfig {
                min_delay_ms: 0,
                max_jitter_ms: 0,
            }),
        );
        let results = engine.enrich_batch(&pool, &ids, false).await;

        let failed: Vec<_> = results.iter().filter(|r| r.error.is_some()).collect();
        assert_eq!(results.len(), 500, "every seeded business is processed");
        assert!(
            failed.is_empty(),
            "500-business run must complete without per-business errors: {failed:?}"
        );
        let paths_len = {
            let paths = AC3_STUB_PATHS.lock();
            paths.len()
        };
        assert_eq!(
            paths_len,
            500,
            "one distinct fetch per business, all through the guarded engine path"
        );

        cleanup_family(&pool, "AC3 Enrich 500").await;
    }

    // /locations validation: out-of-range limits are rejected with 400
    // before any database work (true unit test via the lazy pool).
    #[tokio::test]
    async fn test_locations_limit_out_of_range_rejected() {
        let state = lazy_state();
        for limit in [i32::MIN, -1, 0, 501, i32::MAX] {
            let Err((status, Json(body))) = locations(
                State(state.clone()),
                Json(LocationsRequest {
                    business_ids: None,
                    limit: Some(limit),
                    dry_run: None,
                }),
            )
            .await
            else {
                panic!("limit {limit} must be rejected");
            };
            assert_eq!(status, StatusCode::BAD_REQUEST);
            let value: serde_json::Value = body;
            assert!(value.get("error").is_some());
        }
    }

    // /locations: malformed JSON is rejected by the extractor with 400,
    // before the handler runs.
    #[tokio::test]
    async fn test_locations_malformed_json_returns_400() {
        let state = lazy_state();
        for body in ["{not json", "{'limit': oops}", "{\"limit\": 5"] {
            let app = router(state.clone());
            let req = Request::builder()
                .method("POST")
                .uri("/locations")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .expect("request builds");
            let res = tower::ServiceExt::oneshot(app, req)
                .await
                .expect("router responds");
            assert_eq!(
                res.status(),
                StatusCode::BAD_REQUEST,
                "malformed body must yield 400: {body}"
            );
        }
    }

    // /locations dry run: eligible businesses are reported, but the
    // shared `SearXNG` fixture carries no addresses, so no candidates
    // are built, no geocoding happens, and `business_locations` is
    // untouched.
    #[tokio::test]
    async fn test_locations_dry_run_reports_without_writes() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };
        let _guard = AC3_STUB_LOCK.lock().await;
        fixture_proxy_port();
        cleanup_family(&pool, "AC11 Locations").await;

        let ids = seed_eligible_source(&pool, "AC11 Locations", 2, |_i| {
            "http://maps.google.test/maps/ok?cid=ac11".to_string()
        })
        .await;
        assert_eq!(ids.len(), 2, "two eligible businesses seeded");

        let state = test_state(&pool);
        let res = locations(
            State(state),
            Json(LocationsRequest {
                business_ids: Some(ids.clone()),
                limit: Some(10),
                dry_run: Some(true),
            }),
        )
        .await
        .expect("dry run succeeds");
        let (status, Json(body)) = res;
        let value: serde_json::Value = body;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(value["summary"]["total"], 2);
        assert_eq!(value["summary"]["processed"], 2);
        assert_eq!(value["summary"]["locations_added"], 0);
        assert_eq!(value["summary"]["failed"], 0);
        let business_entries = value["businesses"]
            .as_array()
            .expect("businesses is an array");
        for entry in business_entries {
            let locs = entry.get("locations").and_then(|v| v.as_array());
            assert!(
                locs.is_none_or(Vec::is_empty),
                "fixture SearXNG carries no addresses: {entry:?}"
            );
        }

        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM business_locations WHERE business_id = ANY($1::uuid[])",
        )
        .bind(&ids)
        .fetch_one(&pool)
        .await
        .expect("count reads");
        assert_eq!(count, 0, "dry run must not write location rows");

        cleanup_family(&pool, "AC11 Locations").await;
    }

    // POST /locations live discovery pinned end-to-end: a `SearXNG` snippet
    // carrying a US address plus a `Nominatim` geocode produce one secondary
    // `business_locations` row next to the ensured primary; a re-run dedupes
    // to zero new rows. Routes through the shared fixture proxy like the
    // other handler tests; the /ac12-* path prefixes select this test's
    // fixtures so the process-wide proxy env cannot starve them.
    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn test_locations_run_discovers_and_dedupes() {

        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        // Both bases are unroutable directly; the shared fixture proxy
        // (http_proxy, set by fixture_proxy_port) intercepts them, and the
        // /ac12-* path prefixes select this test's SearXNG/Nominatim
        // fixtures.
        fixture_proxy_port();

        cleanup_family(&pool, "AC12 Loc Run").await;
        let ids = seed_eligible_source(&pool, "AC12 Loc Run", 1, |_i| {
            "http://maps.google.test/maps/ok?cid=ac12-loc".to_string()
        })
        .await;
        let biz_id = ids[0];
        // A real primary address with coordinates far from the candidate's
        // geocode, so the state guard passes and the proximity merge does not
        // mask the string dedupe.
        sqlx::query("UPDATE businesses SET location = $2, lat = 39.70, lng = -89.75 WHERE id = $1")
            .bind(biz_id)
            .bind("10 Main St, Springfield, IL 62701")
            .execute(&pool)
            .await
            .expect("primary address seeded");

        let state = AppState {
            pool: pool.clone(),
            config: Config {
                database_url: "postgresql://localhost/test".to_string(),
                searxng_url: "http://127.0.0.1:1/ac12-search".to_string(),
                host: "127.0.0.1".to_string(),
                port: 1,
                nats_url: None,
                redis_url: None,
                clickhouse_url: None,
                log_level: "info".to_string(),
                nominatim_url: Some("http://127.0.0.1:1/ac12-nominatim".to_string()),
            },
            importer: PostgresImporter::new(pool.clone()),
            searxng: SearxngClient::new("http://127.0.0.1:1"),
        };

        let res = locations(
            State(state.clone()),
            Json(LocationsRequest {
                business_ids: Some(vec![biz_id]),
                limit: Some(10),
                dry_run: None,
            }),
        )
        .await
        .expect("live discovery run succeeds");
        let (status, Json(body)) = res;
        let value: serde_json::Value = body;
        assert_eq!(status, StatusCode::OK, "{value}");
        assert_eq!(value["summary"]["total"], 1, "{value}");
        assert_eq!(value["summary"]["locations_added"], 1, "{value}");
        assert_eq!(value["summary"]["failed"], 0, "{value}");
        let entry = &value["businesses"][0];
        assert_eq!(entry["primary_added"], true, "{value}");
        assert_eq!(entry["locations"][0]["inserted"], true, "{value}");
        assert_eq!(
            entry["locations"][0]["address"],
            "421 West Ave, Ste 2, Springfield, IL 62704",
            "{value}"
        );

        let rows: Vec<(String, bool)> = sqlx::query_as(
            "SELECT address, is_primary FROM business_locations
             WHERE business_id = $1 ORDER BY is_primary DESC",
        )
        .bind(biz_id)
        .fetch_all(&pool)
        .await
        .expect("location rows read");
        assert_eq!(rows.len(), 2, "primary + discovered secondary: {value}");
        assert_eq!(rows[0].0, "10 Main St, Springfield, IL 62701", "{value}");
        assert!(rows[0].1, "{value}");

        // Re-run: the discovered address is already stored -> deduped, no new
        // rows.
        let res2 = locations(
            State(state.clone()),
            Json(LocationsRequest {
                business_ids: Some(vec![biz_id]),
                limit: Some(10),
                dry_run: None,
            }),
        )
        .await
        .expect("second discovery run succeeds");
        let (_, Json(body2)) = res2;
        let value2: serde_json::Value = body2;
        assert_eq!(value2["summary"]["locations_added"], 0, "{value2}");
        assert_eq!(
            value2["businesses"][0]["locations"][0]["inserted"],
            false,
            "repeat address must dedupe: {value2}"
        );

        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM business_locations WHERE business_id = $1",
        )
        .bind(biz_id)
        .fetch_one(&pool)
        .await
        .expect("count reads");
        assert_eq!(count, 2, "re-run must not duplicate rows: {value2}");

        cleanup_family(&pool, "AC12 Loc Run").await;
    }
}
