//! Google place-JSON enrichment engine (fill-empty semantics).
//!
//! Enrichment resolves a business's Google share-link source (via
//! `scraped_businesses`, matched by name — the same join convention
//! migration 019 used to backfill phones), fetches the place JSON, and
//! applies fill-empty updates to the `businesses` row: a field is only
//! written when it is currently empty. Existing values are never
//! clobbered; the per-business report lists what was applied, what was
//! skipped because it already had a value, and any error.

use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::rate_limiter::RateLimiter;
use crate::robots::RobotsChecker;
use crate::user_agent_rotator::UserAgentRotator;

/// Parsed enrichment payload from a Google share-link place JSON.
///
/// Fields the document does not carry stay `None` rather than being
/// fabricated.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PlaceData {
    pub phone: Option<String>,
    pub website: Option<String>,
    pub description: Option<String>,
    pub rating: Option<f64>,
    pub review_count: Option<i32>,
    /// Social links from the place JSON `social` array.
    pub social_urls: Option<Vec<SocialUrl>>,
}

/// One social link ({platform, url}) carried by a place JSON.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SocialUrl {
    pub platform: String,
    pub url: String,
}

/// Snapshot of the `businesses` columns enrichment may write.
#[derive(Debug, Clone, PartialEq)]
pub struct BusinessRow {
    pub id: Uuid,
    pub name: String,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub description: Option<String>,
    pub rating: Option<f64>,
    pub review_count: Option<i32>,
    pub social_urls: Option<serde_json::Value>,
}

/// The value a fill-empty update would write.
#[derive(Debug, Clone, PartialEq)]
pub enum FieldValue {
    Text(String),
    Rating(f64),
    Count(i32),
    Social(serde_json::Value),
}

/// One field the fill-empty plan wants to write.
#[derive(Debug, Clone, PartialEq)]
pub struct PlannedField {
    pub field: &'static str,
    pub value: FieldValue,
}

/// Fill-empty plan for one business against one place JSON.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FillPlan {
    /// Fields that are empty on the row and present in the place JSON.
    pub apply: Vec<PlannedField>,
    /// Fields the place JSON provides but the row already has a value for.
    pub skipped: Vec<&'static str>,
}

/// A field write that actually applied during an enrichment run.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AppliedField {
    pub field: &'static str,
    /// Value before the update; `None` when the field was empty.
    pub previous: Option<String>,
}

/// Per-business enrichment report entry.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EnrichResult {
    pub business_id: Uuid,
    pub business_name: String,
    pub applied: Vec<AppliedField>,
    pub skipped: Vec<&'static str>,
    /// Present when the business has no usable enrichment source.
    pub reason: Option<&'static str>,
    pub error: Option<String>,
}

/// Whether a `scraped_businesses` row is an eligible enrichment source:
/// source `google_maps` with a `source_id` that is a Google Maps URL
/// (maps host, /maps path, or cid= query on a google domain).
pub fn is_google_share_link(source: &str, source_id: &str) -> bool {
    if !source.eq_ignore_ascii_case("google_maps") {
        return false;
    }
    let url = source_id.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return false;
    }
    let after_scheme = url.split_once("://").map(|(_, rest)| rest).unwrap_or("");
    let host = after_scheme.split('/').next().unwrap_or("").to_lowercase();
    if !host.contains("google.") {
        return false;
    }
    host.starts_with("maps.")
        || after_scheme.contains("/maps")
        || after_scheme.contains("cid=")
}

/// Parse a place JSON document into `PlaceData`.
///
/// Accepts the flat share-link JSON shape (see
/// `tests/fixtures/place-json/`); missing or empty fields stay `None`.
pub fn parse_place_json(raw: &str) -> Result<PlaceData, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("parse failed: {e}"))?;
    let obj = value
        .as_object()
        .ok_or_else(|| "parse failed: place JSON is not an object".to_string())?;

    Ok(PlaceData {
        phone: first_string(obj, &["phone", "phoneNumber"]),
        website: first_string(obj, &["website", "url"]),
        description: first_string(obj, &["description", "about"]),
        rating: first_number(obj, &["rating"]),
        review_count: first_int(obj, &["review_count", "reviewCount"]),
        social_urls: social_array(obj),
    })
}

fn first_string(
    obj: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .find_map(|key| obj.get(*key))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn first_number(
    obj: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<f64> {
    keys.iter()
        .find_map(|key| obj.get(*key))
        .and_then(|v| match v {
            serde_json::Value::Number(n) => n.as_f64(),
            serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
            _ => None,
        })
}

fn first_int(
    obj: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<i32> {
    keys.iter()
        .find_map(|key| obj.get(*key))
        .and_then(|v| match v {
            serde_json::Value::Number(n) => n.as_i64().and_then(|n| i32::try_from(n).ok()),
            serde_json::Value::String(s) => s.trim().parse::<i32>().ok(),
            _ => None,
        })
}

fn social_array(
    obj: &serde_json::Map<String, serde_json::Value>,
) -> Option<Vec<SocialUrl>> {
    let array = ["social", "socialUrls", "social_urls"]
        .iter()
        .find_map(|key| obj.get(*key))
        .and_then(|v| v.as_array())?;
    let links: Vec<SocialUrl> = array
        .iter()
        .filter_map(|entry| {
            Some(SocialUrl {
                platform: entry.get("platform")?.as_str()?.trim().to_string(),
                url: entry.get("url")?.as_str()?.trim().to_string(),
            })
        })
        .filter(|l| !l.platform.is_empty() && !l.url.is_empty())
        .collect();
    (!links.is_empty()).then_some(links)
}

/// Build the fill-empty plan: which fields of `place` to write onto
/// `row`, and which to skip because the row already has a value.
///
/// Empty means: text fields NULL/empty string, rating/review_count
/// NULL/0, social_urls NULL.
pub fn plan_fill_empty(row: &BusinessRow, place: &PlaceData) -> FillPlan {
    let mut apply: Vec<PlannedField> = Vec::new();
    let mut skipped: Vec<&'static str> = Vec::new();

    let mut consider_text = |field: &'static str,
                         current: &Option<String>,
                         value: &Option<String>| {
        if let Some(value) = value.as_ref().filter(|v| !v.trim().is_empty()) {
            if current.as_deref().map_or(true, str::is_empty) {
                apply.push(PlannedField {
                    field,
                    value: FieldValue::Text(value.clone()),
                });
            } else {
                skipped.push(field);
            }
        }
    };

    consider_text("phone", &row.phone, &place.phone);
    consider_text("website", &row.website, &place.website);
    consider_text("description", &row.description, &place.description);

    if let Some(rating) = place.rating.filter(|v| *v > 0.0) {
        if row.rating.map_or(true, |v| v <= 0.0) {
            apply.push(PlannedField {
                field: "rating",
                value: FieldValue::Rating(rating),
            });
        } else {
            skipped.push("rating");
        }
    }

    if let Some(count) = place.review_count.filter(|v| *v > 0) {
        if row.review_count.map_or(true, |v| v <= 0) {
            apply.push(PlannedField {
                field: "review_count",
                value: FieldValue::Count(count),
            });
        } else {
            skipped.push("review_count");
        }
    }

    if let Some(social) = place.social_urls.as_ref().filter(|v| !v.is_empty()) {
        if row.social_urls.is_none() {
            apply.push(PlannedField {
                field: "social",
                value: FieldValue::Social(
                    serde_json::to_value(social).expect("SocialUrl serializes"),
                ),
            });
        } else {
            skipped.push("social");
        }
    }

    FillPlan { apply, skipped }
}

/// Resolve the business's Google share-link source.
///
/// `businesses` has no source column; the share-link lives on
/// `scraped_businesses` and is matched by name (the join convention
/// migration 019 used to backfill phones).
async fn resolve_source(
    pool: &PgPool,
    business_id: Uuid,
) -> Result<(String, String, String), String> {
    let row = sqlx::query(
        r#"SELECT b.name,
                  s.source,
                  s.source_id
           FROM businesses b
           LEFT JOIN scraped_businesses s
             ON s.name = b.name AND s.source = 'google_maps'
           WHERE b.id = $1
           ORDER BY s.created_at DESC NULLS LAST
           LIMIT 1"#,
    )
    .bind(business_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("source lookup failed: {e}"))?
    .ok_or_else(|| format!("business not found: {business_id}"))?;

    let name = row.get::<String, _>("name");
    let source = row.get::<Option<String>, _>("source").unwrap_or_default();
    let source_id = row
        .get::<Option<String>, _>("source_id")
        .unwrap_or_default();
    Ok((name, source, source_id))
}

/// Load the `businesses` row fields enrichment may write.
async fn load_business(pool: &PgPool, business_id: Uuid) -> Result<BusinessRow, String> {
    let row = sqlx::query(
        r#"SELECT id,
                  name,
                  phone,
                  website,
                  description,
                  rating::text AS rating,
                  review_count,
                  social_urls::text AS social_urls
           FROM businesses
           WHERE id = $1"#,
    )
    .bind(business_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("business lookup failed: {e}"))?
    .ok_or_else(|| format!("business not found: {business_id}"))?;

    let rating = row
        .get::<Option<String>, _>("rating")
        .and_then(|raw| raw.parse::<f64>().ok());
    let social_urls = row
        .get::<Option<String>, _>("social_urls")
        .and_then(|raw| serde_json::from_str(&raw).ok());

    Ok(BusinessRow {
        id: row.get::<Uuid, _>("id"),
        name: row.get::<String, _>("name"),
        phone: row.get::<Option<String>, _>("phone"),
        website: row.get::<Option<String>, _>("website"),
        description: row.get::<Option<String>, _>("description"),
        rating,
        review_count: row.get::<Option<i32>, _>("review_count"),
        social_urls,
    })
}

/// Apply the fill-empty plan to one business row.
///
/// Each field write is guarded by the same emptiness predicate the plan
/// used, so a concurrent fill between plan and write loses the race
/// instead of clobbering: the affected-rows count decides applied vs
/// skipped.
pub async fn apply_fill_empty(
    pool: &PgPool,
    business_id: Uuid,
    place: &PlaceData,
) -> Result<(Vec<AppliedField>, Vec<&'static str>), String> {
    let row = load_business(pool, business_id).await?;
    let plan = plan_fill_empty(&row, place);

    let mut applied: Vec<AppliedField> = Vec::new();
    // Fields the plan already knows are set stay skipped; lost-race
    // fields are appended below.
    let mut skipped: Vec<&'static str> = plan.skipped.clone();

    for planned in &plan.apply {
        let affected =
            update_field(pool, business_id, planned.field, &planned.value).await?;
        if affected {
            applied.push(AppliedField {
                field: planned.field,
                previous: previous_value(&row, planned.field),
            });
        } else {
            // Lost the race — the row was filled between read and write.
            skipped.push(planned.field);
        }
    }

    Ok((applied, skipped))
}

/// One guarded fill-empty UPDATE; `true` when the row's field was still empty.
async fn update_field(
    pool: &PgPool,
    business_id: Uuid,
    field: &str,
    value: &FieldValue,
) -> Result<bool, String> {
    let sql = match field {
        "phone" => {
            "UPDATE businesses SET phone = $2, updated_at = now() WHERE id = $1 AND phone IS NULL"
        }
        "website" => "UPDATE businesses SET website = $2, updated_at = now() WHERE id = $1 AND website IS NULL",
        "description" => "UPDATE businesses SET description = $2, updated_at = now() WHERE id = $1 AND description IS NULL",
        "rating" => "UPDATE businesses SET rating = $2::numeric, rating_source = 'google', updated_at = now() WHERE id = $1 AND (rating IS NULL OR rating = 0)",
        "review_count" => "UPDATE businesses SET review_count = $2, updated_at = now() WHERE id = $1 AND (review_count IS NULL OR review_count = 0)",
        "social" => "UPDATE businesses SET social_urls = $2::jsonb, updated_at = now() WHERE id = $1 AND social_urls IS NULL",
        other => return Err(format!("unknown enrichment field: {other}")),
    };

    let affected_rows = match value {
        FieldValue::Text(text) => {
            sqlx::query(sql)
                .bind(business_id)
                .bind(text.as_str())
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?
        }
        FieldValue::Rating(rating) => {
            sqlx::query(sql)
                .bind(business_id)
                .bind(rating.to_string())
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?
        }
        FieldValue::Count(count) => {
            sqlx::query(sql)
                .bind(business_id)
                .bind(*count)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?
        }
        FieldValue::Social(json) => {
            let text = serde_json::to_string(json).map_err(|e| e.to_string())?;
            sqlx::query(sql)
                .bind(business_id)
                .bind(text.as_str())
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?
        }
    };

    Ok(affected_rows.rows_affected() == 1)
}

/// Value before the update, `None` when the field was empty.
fn previous_value(row: &BusinessRow, field: &str) -> Option<String> {
    match field {
        "phone" => row.phone.clone().filter(|v| !v.trim().is_empty()),
        "website" => row.website.clone().filter(|v| !v.trim().is_empty()),
        "description" => row.description.clone().filter(|v| !v.trim().is_empty()),
        "rating" => row.rating.filter(|v| *v > 0.0).map(|v| v.to_string()),
        "review_count" => row.review_count.filter(|v| *v > 0).map(|v| v.to_string()),
        "social" => row
            .social_urls
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok()),
        _ => None,
    }
}

/// Enrichment engine: owns the outbound HTTP guards for place-JSON fetches.
pub struct EnrichmentEngine {
    http: Client,
    limiter: RateLimiter,
    rotator: UserAgentRotator,
    robots: RobotsChecker,
}

impl EnrichmentEngine {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .expect("reqwest client builds with default settings");
        Self {
            http,
            limiter: RateLimiter::new(),
            rotator: UserAgentRotator::new(),
            robots: RobotsChecker::new("BlackOwnedBot"),
        }
    }

    /// Fetch the place JSON for a share-link URL (robots + rate-limit +
    /// UA-rotation guarded).
    pub async fn fetch_place_json(&mut self, url: &str) -> Result<String, String> {
        if !self.robots.is_allowed(url) {
            return Err("fetch failed: blocked by robots.txt".to_string());
        }
        self.limiter.wait_before_request().await;
        let user_agent = self.rotator.get_next_user_agent();
        let response = self
            .http
            .get(url)
            .header("User-Agent", user_agent)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("fetch failed: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("fetch failed: HTTP {status}"));
        }
        response.text().await.map_err(|e| format!("fetch failed: {e}"))
    }

    /// Enrich one business end-to-end: resolve its Google share-link,
    /// fetch the place JSON, and apply fill-empty updates.
    pub async fn enrich(&mut self, pool: &PgPool, business_id: Uuid) -> EnrichResult {
        let with_error = |name: String, error: String| EnrichResult {
            business_id,
            business_name: name,
            applied: Vec::new(),
            skipped: Vec::new(),
            reason: None,
            error: Some(error),
        };

        let (name, source, source_id) = match resolve_source(pool, business_id).await {
            Ok(v) => v,
            Err(e) => return with_error(String::new(), e),
        };

        if !is_google_share_link(&source, &source_id) {
            return EnrichResult {
                business_id,
                business_name: name,
                applied: Vec::new(),
                skipped: Vec::new(),
                reason: Some("no enrichment source"),
                error: None,
            };
        }

        let raw = match self.fetch_place_json(&source_id).await {
            Ok(raw) => raw,
            Err(e) => return with_error(name, e),
        };

        let place = match parse_place_json(&raw) {
            Ok(place) => place,
            Err(e) => return with_error(name, e),
        };

        match apply_fill_empty(pool, business_id, &place).await {
            Ok((applied, skipped)) => EnrichResult {
                business_id,
                business_name: name,
                applied,
                skipped,
                reason: None,
                error: None,
            },
            Err(e) => with_error(name, e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_PLACE_JSON: &str =
        include_str!("../tests/fixtures/place-json/southern_kitchen.json");

    fn fixture_place() -> PlaceData {
        parse_place_json(FIXTURE_PLACE_JSON).expect("fixture must parse")
    }

    fn empty_row(name: &str) -> BusinessRow {
        BusinessRow {
            id: Uuid::new_v4(),
            name: name.to_string(),
            phone: None,
            website: None,
            description: None,
            rating: Some(0.0),
            review_count: Some(0),
            social_urls: None,
        }
    }

    // AC1: Fill-empty enrichment from place JSON

    #[test]
    fn test_parse_place_json_full_document() {
        let place = fixture_place();

        assert_eq!(place.phone.as_deref(), Some("+15551234567"));
        assert_eq!(place.website.as_deref(), Some("https://example.com"));
        assert_eq!(
            place.description.as_deref(),
            Some("Southern kitchen and bar")
        );
        assert_eq!(place.rating, Some(4.5));
        assert_eq!(place.review_count, Some(214));
        let social = place.social_urls.expect("fixture carries a social array");
        assert_eq!(social.len(), 2);
        assert_eq!(social[0].platform, "instagram");
        assert_eq!(social[1].url, "https://www.facebook.com/southernkitchenbar");
    }

    #[test]
    fn test_parse_place_json_missing_fields_stay_none() {
        let place = parse_place_json(r#"{"phone": "+15550001111"}"#).expect("parses");

        assert_eq!(place.phone.as_deref(), Some("+15550001111"));
        assert!(place.website.is_none());
        assert!(place.description.is_none());
        assert!(place.rating.is_none());
        assert!(place.review_count.is_none());
        assert!(place.social_urls.is_none());
    }

    #[test]
    fn test_parse_place_json_invalid_input_errors() {
        assert!(parse_place_json("not json at all").is_err());
        assert!(parse_place_json("[1, 2, 3]").is_err());
    }

    #[test]
    fn test_share_link_eligibility() {
        assert!(is_google_share_link(
            "google_maps",
            "https://maps.google.com/?cid=123456789"
        ));
        assert!(is_google_share_link(
            "google_maps",
            "https://www.google.com/maps/place/X/@33.5,-84.5,17z/data=!3m1!4b1"
        ));
        assert!(is_google_share_link(
            "google_maps",
            "https://www.google.com/maps?cid=123456789"
        ));
        assert!(!is_google_share_link(
            "searxng",
            "https://maps.google.com/?cid=123456789"
        ));
        assert!(!is_google_share_link(
            "google_maps",
            "https://example.com/maps/place"
        ));
        assert!(!is_google_share_link("google_maps", "not a url"));
    }

    // AC1: When the enrichment engine runs for b-1 (fully empty row),
    // every place-JSON field lands on the row.
    #[test]
    fn test_plan_fill_empty_all_empty_row_applies_everything() {
        let row = empty_row("b-1");
        let place = fixture_place();

        let plan = plan_fill_empty(&row, &place);

        assert!(
            plan.skipped.is_empty(),
            "fully empty row: nothing should skip, got {:?}",
            plan.skipped
        );
        let fields: Vec<&str> = plan.apply.iter().map(|f| f.field).collect();
        assert_eq!(
            fields,
            vec!["phone", "website", "description", "rating", "review_count", "social"]
        );
    }

    // AC1 scenario: existing values are never clobbered.
    #[test]
    fn test_plan_fill_empty_existing_values_are_skipped_not_clobbered() {
        let mut row = empty_row("b-2");
        row.phone = Some("+15550001111".to_string());
        row.rating = Some(4.2);
        row.review_count = Some(10);

        let place = PlaceData {
            phone: Some("+15559998888".to_string()),
            description: Some("Text from Google".to_string()),
            rating: Some(5.0),
            review_count: Some(500),
            ..PlaceData::default()
        };

        let plan = plan_fill_empty(&row, &place);

        assert!(
            plan.skipped.iter().any(|f| *f == "phone"),
            "pre-set phone must be reported skipped: skipped={:?} apply={:?}",
            plan.skipped,
            plan.apply
        );
        assert!(plan.skipped.iter().any(|f| *f == "rating"));
        assert!(plan.skipped.iter().any(|f| *f == "review_count"));
        assert!(
            !plan.apply.iter().any(|f| f.field == "phone"),
            "pre-set phone must not be planned for write"
        );
        let description = plan
            .apply
            .iter()
            .find(|f| f.field == "description")
            .expect("empty description must be planned");
        match &description.value {
            FieldValue::Text(text) => assert_eq!(text, "Text from Google"),
            other => panic!("expected Text value, got {other:?}"),
        }
    }

    // AC1: database assertions against the compose Postgres (DATABASE_URL,
    // defaults to the local compose stack) — skipped when unreachable.
    async fn test_pool() -> Result<PgPool, String> {
        let url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/black_owned".to_string());
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .map_err(|e| format!("connect failed: {e}"))
    }

    #[tokio::test]
    async fn test_apply_fill_empty_writes_only_empty_fields() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        // Idempotent cleanup of residue from prior runs.
        sqlx::query(
            "DELETE FROM businesses WHERE name IN ('Enrichment Test Business', 'Enrichment Test Business 2')",
        )
        .execute(&pool)
        .await
        .expect("cleanup delete");

        let place = fixture_place();

        let email = format!("enrich-test-{}@example.com", Uuid::new_v4());
        let user_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, 'test', 'Enrich Test', 'admin')
                 RETURNING id",
            )
            .bind(&email)
            .fetch_one(&pool)
            .await
            .expect("seed user inserts");
            row.get::<Uuid, _>("id")
        };

        let business_id: Uuid = {
            let row = sqlx::query(
                r#"INSERT INTO businesses
                   (owner_id, name, description, category_id, rating, review_count, phone, website, social_urls)
                   VALUES ($1, 'Enrichment Test Business', NULL, 'test-enrichment', 0, 0, NULL, NULL, NULL)
                   RETURNING id"#,
            )
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .expect("seed business inserts");
            row.get::<Uuid, _>("id")
        };

        let (applied, skipped) =
            apply_fill_empty(&pool, business_id, &place)
                .await
                .expect("apply succeeds on the compose Postgres");

        assert!(
            skipped.is_empty(),
            "fully empty row: nothing should skip, got {skipped:?}"
        );
        let fields: Vec<&str> = applied.iter().map(|a| a.field).collect();
        assert_eq!(
            fields,
            vec!["phone", "website", "description", "rating", "review_count", "social"]
        );

        let row = sqlx::query(
            r#"SELECT phone, website, description, rating::text, review_count,
                      rating_source, social_urls::text
               FROM businesses WHERE id = $1"#,
        )
        .bind(business_id)
        .fetch_one(&pool)
        .await
        .expect("row reads back");

        assert_eq!(row.get::<Option<String>, _>("phone").as_deref(), Some("+15551234567"));
        assert_eq!(row.get::<Option<String>, _>("website").as_deref(), Some("https://example.com"));
        assert_eq!(
            row.get::<Option<String>, _>("description").as_deref(),
            Some("Southern kitchen and bar")
        );
        assert_eq!(
            row.get::<Option<String>, _>("rating")
                .and_then(|raw| raw.parse::<f64>().ok()),
            Some(4.5)
        );
        assert_eq!(row.get::<Option<i32>, _>("review_count"), Some(214));
        assert_eq!(
            row.get::<Option<String>, _>("rating_source").as_deref(),
            Some("google")
        );
        let social_text = row
            .get::<Option<String>, _>("social_urls")
            .expect("social_urls written");
        let social: serde_json::Value = serde_json::from_str(&social_text).expect("social json");
        assert_eq!(social.as_array().expect("social is an array").len(), 2);

        // Partial row: pre-set phone survives, empty description fills,
        // report lists phone as skipped.
        let business_id2: Uuid = {
            let row = sqlx::query(
                r#"INSERT INTO businesses
                   (owner_id, name, description, category_id, rating, review_count, phone, website, social_urls)
                   VALUES ($1, 'Enrichment Test Business 2', NULL, 'test-enrichment', 0, 0, '+15550001111', NULL, NULL)
                   RETURNING id"#,
            )
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .expect("seed business 2 inserts");
            row.get::<Uuid, _>("id")
        };

        let place2 = PlaceData {
            phone: Some("+15559998888".to_string()),
            description: Some("Text from Google".to_string()),
            ..PlaceData::default()
        };
        let (applied2, skipped2) =
            apply_fill_empty(&pool, business_id2, &place2)
                .await
                .expect("apply succeeds for the partial row");

        assert!(
            skipped2.iter().any(|f| *f == "phone"),
            "pre-set phone must be reported skipped: {skipped2:?}"
        );
        assert!(applied2.iter().any(|a| a.field == "description"));
        assert!(!applied2.iter().any(|a| a.field == "phone"));

        let row2 = sqlx::query("SELECT phone, description FROM businesses WHERE id = $1")
            .bind(business_id2)
            .fetch_one(&pool)
            .await
            .expect("row 2 reads back");
        assert_eq!(row2.get::<Option<String>, _>("phone").as_deref(), Some("+15550001111"));
        assert_eq!(
            row2.get::<Option<String>, _>("description").as_deref(),
            Some("Text from Google")
        );

        // Cleanup: remove seeded rows (compose dev DB, kept tidy).
        sqlx::query("DELETE FROM businesses WHERE id = ANY($1)")
            .bind(vec![business_id, business_id2])
            .execute(&pool)
            .await
            .expect("business cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("user cleanup");
    }
}
