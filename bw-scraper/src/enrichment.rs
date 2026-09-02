//! `SearXNG` enrichment engine (fill-empty semantics).
//!
//! Enrichment gates on a business's `google_maps` source row (via
//! `scraped_businesses`, matched by name — the same join convention
//! migration 019 used to backfill phones), looks the business up on
//! `SearXNG` by name + location, and applies fill-empty updates to the
//! `businesses` row: a field is only written when it is currently
//! empty. The top `SearXNG` result supplies `website` (result URL) and
//! `description` (snippet); `phone` is the first US phone (ETL regex)
//! found scanning results in rank order, taken only from the top result
//! or results titled with the full business name. Menu discovery: a
//! menu-like link on the homepage (depth 1); when the homepage fetch
//! fails or carries no menu link, a `SearXNG` result on the website's
//! own host that mentions a menu fills the same field. Existing values are
//! never clobbered;
//! the per-business report lists what was applied, what was skipped
//! because it already had a value, and any error.

use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::etl::extract_us_phone;
use crate::locations;
use crate::rate_limiter::RateLimiter;
use crate::robots::RobotsChecker;
use crate::searxng::{SearxngResponse, SearxngResult};
use crate::user_agent_rotator::UserAgentRotator;

/// Enrichment payload for one business.
///
/// The `SearXNG` lookup populates `website` (top result URL),
/// `description` (top result snippet), and `phone` (first ranked
/// snippet carrying a US phone: the top result or a result titled with
/// the business name). Fields the source does not carry stay `None`
/// rather than being fabricated.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PlaceData {
    pub phone: Option<String>,
    pub website: Option<String>,
    pub description: Option<String>,
    pub rating: Option<f64>,
    pub review_count: Option<i32>,
    /// Social links from the place JSON `social` array.
    pub social_urls: Option<Vec<SocialUrl>>,
    /// Photo URLs from the place JSON `photos` array, in document order.
    pub photos: Option<Vec<String>>,
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
    pub location: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub description: Option<String>,
    pub rating: Option<f64>,
    pub review_count: Option<i32>,
    pub menu_url: Option<String>,
    pub image_url: Option<String>,
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
    /// Informational run-report notes (e.g. "no menu link found").
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
    /// Secondary locations discovered this run (empty = none found or
    /// written; omitted from JSON when empty).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub locations: Vec<locations::LocationDiscovered>,
    /// Present when the business has no usable enrichment source.
    pub reason: Option<&'static str>,
    pub error: Option<String>,
}

/// Whether a `scraped_businesses` row is an eligible enrichment source:
/// source `google_maps` with a `source_id` that is a Google Maps URL
/// (maps host, /maps path, or cid= query on a google domain).
#[must_use]
pub fn is_google_share_link(source: &str, source_id: &str) -> bool {
    if !source.eq_ignore_ascii_case("google_maps") {
        return false;
    }
    let url = source_id.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return false;
    }
    let after_scheme = url.split_once("://").map_or("", |(_, rest)| rest);
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
    ///
    /// # Errors
    ///
    /// Returns an error when the document is not valid JSON or is not a
    /// JSON object.
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
        photos: photo_urls(obj),
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

/// Photo URLs from the place JSON `photos` array, in document order.
///
/// Entries may be `{"uri": ...}` objects (Google's shape), `{"url": ...}`,
/// or bare URL strings; entries without a usable URL and blank strings
/// are dropped.
fn photo_urls(obj: &serde_json::Map<String, serde_json::Value>) -> Option<Vec<String>> {
    let array = obj.get("photos").and_then(|v| v.as_array())?;
    let urls: Vec<String> = array
        .iter()
        .filter_map(|entry| match entry {
            serde_json::Value::String(s) => Some(s.trim().to_string()),
            serde_json::Value::Object(o) => o
                .get("uri")
                .or_else(|| o.get("url"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .map(str::to_string),
            _ => None,
        })
        .filter(|u| !u.is_empty())
        .collect();
    (!urls.is_empty()).then_some(urls)
}

/// Outcome of the menu-discovery pass for one business.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MenuOutcome {
    /// A menu-like link was found on the homepage; `menu_url` was
    /// written (or would be written under `dry_run`).
    Found(String),
    /// The homepage fetch was blocked or carried no menu link, but a
    /// `SearXNG` result on the website's own host identified a menu
    /// page; `menu_url` was written (or would be, under `dry_run`).
    FoundInResults(String),
    /// The homepage was fetched but carried no menu-like link.
    NoMenuLink,
    /// The homepage fetch failed (timeout, HTTP error, robots.txt);
    /// `menu_url` is unchanged.
    FetchFailed(String),
    /// Pass did not run: no website, or `menu_url` already set.
    NotApplicable,
}

/// Outcome of the photo-selection pass for one business.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PhotoOutcome {
    /// The first photo URL passed the HEAD check (success status with an
    /// `image/*` content type); `image_url` was written (or would be
    /// written under `dry_run`).
    Selected(String),
    /// The first photo URL failed the HEAD check — 404, non-image
    /// content type, or transport failure; `image_url` is unchanged.
    CheckFailed(String),
    /// Pass did not run: the place JSON carries no photos, or
    /// `image_url` already has a value (fill-empty).
    NotApplicable,
}

/// Extract the first menu-like link from an HTML document.
///
/// A menu-like link is the first `<a href>` in document order whose
/// resolved path contains "menu" (case-insensitive) or ends in ".pdf".
/// Non-web schemes (`mailto:`, `tel:`, `javascript:`, `data:`) and
/// bare in-page fragments are ignored. Relative links resolve against
/// `page_url`.
    // `path` is lowercased before comparison, so the extension check is
    // case-insensitive; the lint cannot track that.
    #[allow(clippy::case_sensitive_file_extension_comparisons)]
pub fn find_menu_url(html: &str, page_url: &str) -> Option<String> {
    static A_HREF: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?i)<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))"#)
            .expect("menu-link regex compiles")
    });

    for caps in A_HREF.captures_iter(html) {
        let raw = caps
            .get(1)
            .or_else(|| caps.get(2))
            .or_else(|| caps.get(3))?
            .as_str()
            .trim();
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }
        let lower = raw.to_lowercase();
        if lower.starts_with("mailto:")
            || lower.starts_with("tel:")
            || lower.starts_with("javascript:")
            || lower.starts_with("data:")
        {
            continue;
        }
        let Some(candidate) = resolve_link(page_url, raw) else {
            continue;
        };
        let path = candidate
            .split(['?', '#'])
            .next()
            .unwrap_or("")
            .to_lowercase();
        if path.contains("menu") || path.ends_with(".pdf") {
            return Some(candidate);
        }
    }
    None
}

/// Find a menu page among `SearXNG` results: the first result (rank
/// order) whose URL is on the same host as `website` (case- and
/// `www.`-insensitive) and whose path or title contains "menu".
///
/// Fallback for [`Self::discover_menu_on_row`] when the homepage cannot
/// confirm the menu link (blocked fetch, or no menu-like link) but the
/// search index has already surfaced the menu page.
#[must_use]
pub fn find_menu_result(results: &[SearxngResult], website: &str) -> Option<String> {
    let (_, website_host, _) = split_url(website)?;
    let website_host = website_host.to_lowercase();
    let site_host = website_host.strip_prefix("www.").unwrap_or(&website_host);
    for result in results {
        let Some((_, result_host, result_path)) = split_url(&result.url) else {
            continue;
        };
        let result_host = result_host.to_lowercase();
        let result_host = result_host.strip_prefix("www.").unwrap_or(&result_host);
        if result_host != site_host {
            continue;
        }
        let path = result_path
            .split(['?', '#'])
            .next()
            .unwrap_or("")
            .to_lowercase();
        let title = result.title.to_lowercase();
        if path.contains("menu") || title.contains("menu") {
            return Some(result.url.clone());
        }
    }
    None
}

/// Split an http(s) URL into (scheme, authority, path).
fn split_url(url: &str) -> Option<(&str, &str, &str)> {
    let (scheme, rest) = url.split_once("://")?;
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    Some((scheme, authority, path))
}

/// Resolve `href` against `base` for menu discovery (depth 1): absolute
/// http(s) links pass through unchanged; `//host`, `/path`, and
/// relative paths resolve against `base`'s origin. Bare fragments have
/// no page target and yield `None`.
fn resolve_link(base: &str, href: &str) -> Option<String> {
    let (scheme, authority, base_path) = split_url(base)?;
    let lower = href.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(href.to_string());
    }
    if let Some(rest) = href.strip_prefix("//") {
        return Some(format!("{scheme}://{rest}"));
    }
    if let Some(query) = href.strip_prefix('?') {
        return Some(format!("{scheme}://{authority}{base_path}?{query}"));
    }
    let rel = href.split('#').next().unwrap_or("");
    if rel.is_empty() {
        return None;
    }
    let dir = match base_path.rfind('/') {
        Some(i) => &base_path[..=i],
        None => "/",
    };
    let joined = format!("{dir}{rel}");
    let mut segments: Vec<&str> = Vec::new();
    for segment in joined.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            s => segments.push(s),
        }
    }
    Some(format!("{scheme}://{authority}/{}", segments.join("/")))
}

/// Build the fill-empty plan: which fields of `place` to write onto
/// `row`, and which to skip because the row already has a value.
///
/// Empty means: text fields NULL/empty string, `rating/review_count`
/// NULL/0, `social_urls` NULL.
#[must_use]
    ///
    /// # Panics
    ///
    /// Panics if a `SocialUrl` value cannot be serialized to JSON
    /// (cannot occur).
pub fn plan_fill_empty(row: &BusinessRow, place: &PlaceData) -> FillPlan {
    let mut apply: Vec<PlannedField> = Vec::new();
    let mut skipped: Vec<&'static str> = Vec::new();

    let mut consider_text = |field: &'static str,
                         current: &Option<String>,
                         value: &Option<String>| {
        if let Some(value) = value.as_ref().filter(|v| !v.trim().is_empty()) {
            if current.as_deref().is_none_or(str::is_empty) {
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
        if row.rating.is_none_or(|v| v <= 0.0) {
            apply.push(PlannedField {
                field: "rating",
                value: FieldValue::Rating(rating),
            });
        } else {
            skipped.push("rating");
        }
    }

    if let Some(count) = place.review_count.filter(|v| *v > 0) {
        if row.review_count.is_none_or(|v| v <= 0) {
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

/// Resolve the business's `google_maps` source row — the eligibility
/// gate for enrichment.
///
/// `businesses` has no source column; the source row lives on
/// `scraped_businesses` and is matched by name (the join convention
/// migration 019 used to backfill phones). The share-link `source_id`
/// is never fetched; the `SearXNG` lookup is keyed on the business name
/// (+ location). It gates eligibility via `is_google_share_link`.
async fn resolve_source(
    pool: &PgPool,
    business_id: Uuid,
) -> Result<(String, String, String), String> {
    let row = sqlx::query(
        r"SELECT b.name,
                  s.source,
                  s.source_id
           FROM businesses b
           LEFT JOIN scraped_businesses s
             ON s.name = b.name AND s.source = 'google_maps'
           WHERE b.id = $1
           ORDER BY s.created_at DESC NULLS LAST
           LIMIT 1",
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
        r"SELECT id,
                  name,
                  location,
                  phone,
                  website,
                  description,
                  rating::text AS rating,
                  review_count,
                  menu_url,
                  image_url,
                  social_urls::text AS social_urls
           FROM businesses
           WHERE id = $1",
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
        location: row.get::<Option<String>, _>("location"),
        phone: row.get::<Option<String>, _>("phone"),
        website: row.get::<Option<String>, _>("website"),
        description: row.get::<Option<String>, _>("description"),
        rating,
        review_count: row.get::<Option<i32>, _>("review_count"),
        menu_url: row.get::<Option<String>, _>("menu_url"),
        image_url: row.get::<Option<String>, _>("image_url"),
        social_urls,
    })
}

/// Apply the fill-empty plan to one business row.
///
/// Each field write is guarded by the same emptiness predicate the plan
/// used, so a concurrent fill between plan and write loses the race
/// instead of clobbering: the affected-rows count decides applied vs
/// skipped. With `dry_run` the plan is reported as the fields that would
/// apply and zero UPDATE statements are issued.
    ///
    /// # Errors
    ///
    /// Returns an error when loading the business row or a field UPDATE
    /// fails.
pub async fn apply_fill_empty(
    pool: &PgPool,
    business_id: Uuid,
    place: &PlaceData,
    dry_run: bool,
) -> Result<(Vec<AppliedField>, Vec<&'static str>), String> {
    let row = load_business(pool, business_id).await?;
    let plan = plan_fill_empty(&row, place);

    let mut applied: Vec<AppliedField> = Vec::new();
    // Fields the plan already knows are set stay skipped; lost-race
    // fields are appended below.
    let mut skipped: Vec<&'static str> = plan.skipped.clone();

    for planned in &plan.apply {
        if dry_run {
            // Report what would apply without issuing any UPDATE.
            applied.push(AppliedField {
                field: planned.field,
                previous: previous_value(&row, planned.field),
            });
            continue;
        }
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
        "menu_url" => "UPDATE businesses SET menu_url = $2, updated_at = now() WHERE id = $1 AND menu_url IS NULL",
        "image_url" => "UPDATE businesses SET image_url = $2, updated_at = now() WHERE id = $1 AND image_url IS NULL",
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
        "menu_url" => row.menu_url.clone().filter(|v| !v.trim().is_empty()),
        "image_url" => row.image_url.clone().filter(|v| !v.trim().is_empty()),
        "social" => row
            .social_urls
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok()),
        _ => None,
    }
}

/// Enrichment engine: owns the outbound HTTP guards for `SearXNG` lookups.
pub struct EnrichmentEngine {
    http: Client,
    limiter: RateLimiter,
    rotator: UserAgentRotator,
    robots: RobotsChecker,
    /// `SearXNG` base URL (e.g. `http://192.168.68.50:8888`); lookups hit
    /// `{base}/search?q=...&format=json`.
    searxng_base: String,
    /// Geocoder for the location-discovery pass (Nominatim by default).
    geocoder: locations::Geocoder,
}

/// Body cap for the homepage menu-discovery fetch (500 KB).
const HOMEPAGE_BODY_CAP: usize = 500 * 1024;

impl EnrichmentEngine {
    /// Production constructor: default limiter.
    #[must_use]
    pub fn new(searxng_base: &str) -> Self {
        Self::with_limiter(searxng_base, RateLimiter::new())
    }

    /// Build the engine with an injected rate limiter. Production uses
    /// [`EnrichmentEngine::new`]; tests inject a fast or known-delay
    /// limiter so a bounded batch can run without the production
    /// per-fetch delay, and so tests can prove every external fetch
    /// waits on the limiter.
    ///
    /// # Panics
    ///
    /// Panics if the reqwest client cannot be built (should not occur with
    /// default settings).
    #[must_use]
    pub fn with_limiter(searxng_base: &str, limiter: RateLimiter) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .expect("reqwest client builds with default settings");
        let geocoder = locations::Geocoder::new(&http, locations::DEFAULT_NOMINATIM_URL);
        Self {
            http,
            limiter,
            rotator: UserAgentRotator::new(),
            robots: RobotsChecker::new(),
            searxng_base: searxng_base.trim_end_matches('/').to_string(),
            geocoder,
        }
    }

    /// Point the location-discovery geocoder at a custom `Nominatim`
    /// endpoint (e.g. a local mirror or a test stub).
    #[must_use]
    pub fn with_nominatim(mut self, base: &str) -> Self {
        self.geocoder = locations::Geocoder::new(&self.http, base);
        self
    }

    /// Look the business up on `SearXNG` (robots + rate-limit +
    /// UA-rotation guarded — the engine's single guarded path for
    /// outbound enrichment fetches). `Ok(None)` means the lookup returned
    /// no results: the caller reports "no enrichment source".
    ///
    /// # Errors
    ///
    /// Returns an error when the robots check blocks the lookup, the
    /// request fails, the instance answers a non-2xx status, or the
    /// body is not valid `SearXNG` JSON.
    pub async fn fetch_search_results(
        &mut self,
        name: &str,
        location: &str,
    ) -> Result<Option<Vec<SearxngResult>>, String> {
        let mut query = name.trim().to_string();
        let loc = location.trim();
        if !loc.is_empty() {
            if !query.is_empty() {
                query.push(' ');
            }
            query.push_str(loc);
        }
        if query.is_empty() {
            return Ok(None);
        }

        let url = format!("{}/search", self.searxng_base);
        if !self.robots.is_allowed(&url) {
            return Err("searxng lookup blocked by robots.txt".to_string());
        }
        self.limiter.wait_before_request().await;
        let user_agent = self.rotator.get_next_user_agent();
        let response = self
            .http
            .get(&url)
            .query(&[("q", query.as_str()), ("format", "json")])
            .header("User-Agent", user_agent)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("searxng lookup failed: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("searxng lookup failed: HTTP {}", status.as_u16()));
        }
        let body = response
            .text()
            .await
            .map_err(|e| format!("searxng lookup failed: {e}"))?;
        let parsed: SearxngResponse =
            serde_json::from_str(&body).map_err(|e| format!("searxng lookup failed: {e}"))?;

        if parsed.results.is_empty() {
            Ok(None)
        } else {
            Ok(Some(parsed.results))
        }
    }

    /// Derive the fill-empty payload from the `SearXNG` results:
    /// `website` = top result URL, `description` = top snippet.
    /// `phone` is the first US phone (ETL regex) found scanning the
    /// results in rank order; only the top result and results whose
    /// title carries the full business name are eligible, so listicle
    /// snippets that cite other businesses' phones cannot leak into
    /// the entry.
    #[must_use]
    pub fn place_from_results(
        results: &[SearxngResult],
        business_name: &str,
    ) -> Option<PlaceData> {
        let top = results.first()?;
        let phone = results
            .iter()
            .enumerate()
            .filter(|(rank, r)| {
                *rank == 0 || locations::title_has_full_name(&r.title, business_name)
            })
            .find_map(|(_, r)| r.content.as_deref().and_then(extract_us_phone));
        Some(PlaceData {
            phone,
            website: (!top.url.trim().is_empty()).then(|| top.url.clone()),
            description: top
                .content
                .as_ref()
                .filter(|content| !content.trim().is_empty())
                .cloned(),
            rating: None,
            review_count: None,
            social_urls: None,
            photos: None,
        })
    }

    /// Backwards-compatible single-payload lookup (see
    /// [`Self::fetch_search_results`] for the full result list).
    ///
    /// # Errors
    ///
    /// Propagates [`Self::fetch_search_results`] errors.
    pub async fn fetch_place_data(&mut self, name: &str, location: &str) -> Result<Option<PlaceData>, String> {
        self.fetch_search_results(name, location)
            .await
            .map(|found| found.and_then(|results| Self::place_from_results(&results, name)))
    }

    /// Enrich one business end-to-end: gate on its `google_maps` source
    /// row, look the business up on `SearXNG` (query = name + location),
    /// apply fill-empty updates, then run the menu-discovery and
    /// photo-selection passes against the pre-run row (values written by
    /// this run are picked up on the next run). `dry_run` reports the
    /// fields that would apply without writing.
    pub async fn enrich(&mut self, pool: &PgPool, business_id: Uuid, dry_run: bool) -> EnrichResult {
        let with_error = |name: String, error: String| EnrichResult {
            business_id,
            business_name: name,
            applied: Vec::new(),
            skipped: Vec::new(),
            notes: Vec::new(),
            locations: Vec::new(),
            reason: None,
            error: Some(error),
        };

        // Pre-run snapshot: the menu pass judges on website/menu_url as
        // they stood before this run, not on values written by the
        // SearXNG pass below.
        let pre_run_row = match load_business(pool, business_id).await {
            Ok(row) => row,
            Err(e) => return with_error(String::new(), e),
        };

        let (name, source, source_id) = match resolve_source(pool, business_id).await {
            Ok(v) => v,
            Err(e) => return with_error(String::new(), e),
        };

        let mut lookup = LookupOut { place: None, results: None };

        let mut result = if is_google_share_link(&source, &source_id) {
            let location = pre_run_row.location.clone().unwrap_or_default();
            self.lookup_and_apply(
                pool,
                business_id,
                &name,
                &location,
                &mut lookup,
                dry_run,
            )
            .await
            .unwrap_or_else(|e| with_error(name.clone(), e))
        } else {
            EnrichResult {
                business_id,
                business_name: name.clone(),
                applied: Vec::new(),
                skipped: Vec::new(),
                notes: Vec::new(),
                locations: Vec::new(),
                reason: Some("no enrichment source"),
                error: None,
            }
        };

        let LookupOut {
            place,
            results: search_results,
        } = lookup;

        // Menu-discovery pass: depth 1 (homepage only), independent of
        // the place-JSON outcome; falls back to this run's SearXNG
        // results when the homepage cannot confirm the menu link.
        self.run_menu_pass(
            pool,
            business_id,
            &pre_run_row,
            search_results.as_deref(),
            dry_run,
            &mut result,
        )
        .await;

        // Photo-selection pass: sibling of the menu pass, judged on the
        // pre-run row so an image_url written by this run is not
        // re-checked, and on this run's place JSON for the photo URLs.
        if let Some(place) = place {
            match self
                .discover_photo_on_place(pool, business_id, &pre_run_row, &place, dry_run)
                .await
            {
                Ok(PhotoOutcome::Selected(url)) => {
                    tracing::info!(business_id = %business_id, image_url = %url, "photo selected");
                    result.applied.push(AppliedField {
                        field: "image_url",
                        previous: None,
                    });
                }
                Ok(PhotoOutcome::CheckFailed(detail)) => {
                    tracing::warn!(business_id = %business_id, "photo check failed: {detail}");
                    result.notes.push("photo url failed check".to_string());
                }
                Ok(PhotoOutcome::NotApplicable) => {}
                Err(error) => {
                    tracing::warn!(business_id = %business_id, "photo selection error: {error}");
                    result.notes.push(format!("photo selection failed: {error}"));
                }
            }
        }

        // Location-discovery pass: independent of the place-JSON outcome;
        // a failure is a note, never a business failure.
        self.run_location_pass(pool, business_id, &pre_run_row, search_results.as_ref(), dry_run, &mut result)
            .await;

        result
    }

    /// Menu-discovery pass over the pre-run row: homepage first, with
    /// the `SearXNG` results as fallback when the homepage cannot
    /// confirm the menu link. Merges the outcome (applied fields,
    /// notes) into `result`.
    async fn run_menu_pass(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        pre_run_row: &BusinessRow,
        search_results: Option<&[SearxngResult]>,
        dry_run: bool,
        result: &mut EnrichResult,
    ) {
        // The row-level guards (no website, or `menu_url` already set)
        // live inside `discover_menu_on_row`; either way the outcome
        // merges the same way.
        let menu_outcome = self
            .discover_menu_on_row(
                pool,
                business_id,
                pre_run_row,
                dry_run,
                search_results.unwrap_or(&[]),
            )
            .await;
        match menu_outcome {
            Ok(MenuOutcome::Found(url)) => {
                tracing::info!(
                    business_id = %business_id,
                    menu_url = %url,
                    "menu discovered on homepage"
                );
                result.applied.push(AppliedField {
                    field: "menu_url",
                    previous: None,
                });
            }
            Ok(MenuOutcome::FoundInResults(url)) => {
                tracing::info!(
                    business_id = %business_id,
                    menu_url = %url,
                    "menu discovered in search results"
                );
                result.applied.push(AppliedField {
                    field: "menu_url",
                    previous: None,
                });
            }
            Ok(MenuOutcome::NoMenuLink) => {
                result.notes.push("no menu link found".to_string());
            }
            Ok(MenuOutcome::FetchFailed(error)) => {
                tracing::warn!(business_id = %business_id, "menu discovery failed: {error}");
                result.notes.push(format!("menu discovery failed: {error}"));
            }
            Ok(MenuOutcome::NotApplicable) => {}
            Err(error) => {
                tracing::warn!(business_id = %business_id, "menu discovery error: {error}");
                result.notes.push(format!("menu discovery failed: {error}"));
            }
        }
    }

    /// Location-discovery pass over this run's `SearXNG` results: ensures
    /// the primary row, mines snippets for secondary addresses, geocodes
    /// and inserts them, then merges the outcome (notes + discovered
    /// locations) into `result`. Failures become notes, never errors.
    async fn run_location_pass(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        pre_run_row: &BusinessRow,
        search_results: Option<&Vec<SearxngResult>>,
        dry_run: bool,
        result: &mut EnrichResult,
    ) {
        let Some(results) = search_results else {
            return;
        };
        match self
            .discover_locations_on_results(pool, business_id, &pre_run_row.name, results, pre_run_row, dry_run)
            .await
        {
            Ok(outcome) => {
                if outcome.primary_added {
                    tracing::info!(business_id = %business_id, "primary location row ensured");
                    result.notes.push("primary location row ensured".to_string());
                }
                for found in &outcome.locations {
                    if found.inserted {
                        tracing::info!(
                            "secondary location written: business {business_id}, label {}",
                            found.label.as_deref().unwrap_or("")
                        );
                    }
                }
                result.notes.extend(outcome.notes);
                result.locations = outcome.locations;
            }
            Err(e) => {
                tracing::warn!(business_id = %business_id, "location discovery failed: {e}");
                result.notes.push(format!("location discovery failed: {e}"));
            }
        }
    }

    /// Look the business up on `SearXNG` and apply the fill-empty plan.
    /// Stores the parsed place into `out.place` (photo pass) and the raw
    /// result list into `out.results` (location-discovery pass).
    async fn lookup_and_apply(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        name: &str,
        location: &str,
        out: &mut LookupOut,
        dry_run: bool,
    ) -> Result<EnrichResult, String> {
        let looked_up = self.fetch_search_results(name, location).await?;
        match looked_up {
            Some(found) => {
                let parsed = Self::place_from_results(&found, name)
                    .expect("non-empty result list carries a top result");
                out.place = Some(parsed.clone());
                out.results = Some(found);
                let (applied, skipped) =
                    apply_fill_empty(pool, business_id, &parsed, dry_run).await?;
                Ok(EnrichResult {
                    business_id,
                    business_name: name.to_string(),
                    applied,
                    skipped,
                    notes: Vec::new(),
                    locations: Vec::new(),
                    reason: None,
                    error: None,
                })
            }
            None => Ok(EnrichResult {
                business_id,
                business_name: name.to_string(),
                applied: Vec::new(),
                skipped: Vec::new(),
                notes: Vec::new(),
                locations: Vec::new(),
                reason: Some("no enrichment source"),
                error: None,
            }),
        }
    }

    /// Location-discovery pass over one business: gate on the
    /// `google_maps` source, fetch `SearXNG` results, then run
    /// [`Self::discover_locations_on_results`] over them.
    ///
    /// # Errors
    ///
    /// Returns an error when the source gate or the `SearXNG` lookup
    /// fails; per-candidate geocode misses become notes instead.
    pub async fn discover_business_locations(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        dry_run: bool,
    ) -> Result<locations::LocationDiscoveryOutcome, String> {
        let row = load_business(pool, business_id).await?;
        let (name, source, source_id) = resolve_source(pool, business_id).await?;
        if !is_google_share_link(&source, &source_id) {
            return Ok(locations::LocationDiscoveryOutcome {
                business_name: name,
                reason: Some("no enrichment source".to_string()),
                ..Default::default()
            });
        }
        let location = row.location.clone().unwrap_or_default();
        let results = self.fetch_search_results(&name, &location).await?;
        if let Some(results) = results {
            self.discover_locations_on_results(pool, business_id, &row.name, &results, &row, dry_run)
                .await
        } else {
            Ok(locations::LocationDiscoveryOutcome {
                business_name: name,
                notes: vec!["no searxng results".to_string()],
                ..Default::default()
            })
        }
    }

    /// Location-discovery pass over an already-fetched result list: build
    /// address-driven candidates, geocode them via the shared rate
    /// limiter, merge near-duplicates, and upsert non-duplicate secondary
    /// locations into `business_locations`. Also ensures the primary row
    /// exists (data-model completeness).
    ///
    /// # Errors
    ///
    /// Returns an error when the primary-ensure or a location insert
    /// round-trip fails; individual geocode misses become notes.
    pub async fn discover_locations_on_results(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        name: &str,
        results: &[SearxngResult],
        row: &BusinessRow,
        dry_run: bool,
    ) -> Result<locations::LocationDiscoveryOutcome, String> {
        let mut outcome = locations::LocationDiscoveryOutcome {
            business_name: name.to_string(),
            ..Default::default()
        };

        let mut existing: Vec<(f64, f64, String)> = Vec::new();
        if !dry_run {
            outcome.primary_added = locations::ensure_primary_location(pool, business_id).await?;
            existing = sqlx::query_as(
                "SELECT lat, lng, address FROM business_locations
                 WHERE business_id = $1 AND lat IS NOT NULL AND lng IS NOT NULL",
            )
            .bind(business_id)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
        }

        let candidates =
            locations::filter_candidates(&locations::build_candidates(name, results), &row.location);
        let mut capped = candidates;
        capped.truncate(locations::MAX_CANDIDATES_TO_GEOCODE);

        let mut groups: Vec<GeocodedCandidate> = Vec::new();
        for cand in &capped {
            let label_votes = cand.labels.clone();
            if dry_run {
                outcome.locations.push(locations::LocationDiscovered {
                    label: locations::pick_label(&label_votes, &cand.parsed.city),
                    address: cand.parsed.full.clone(),
                    lat: None,
                    lng: None,
                    inserted: false,
                });
                continue;
            }
            self.limiter.wait_before_request().await;
            match self.geocoder.geocode(&cand.parsed.full).await {
                Ok(Some((lat, lng))) => {
                    if let Some(group) = groups
                        .iter_mut()
                        .find(|g| locations::distance_m(g.lat, g.lng, lat, lng) <= locations::MERGE_DISTANCE_M)
                    {
                        group.addresses.push(cand.parsed.full.clone());
                        group.labels.extend(label_votes);
                    } else {
                        groups.push(GeocodedCandidate {
                            addresses: vec![cand.parsed.full.clone()],
                            labels: label_votes,
                            lat,
                            lng,
                        });
                    }
                }
                Ok(None) => outcome.notes.push(format!(
                    "no geocode result for {}; skipped",
                    cand.parsed.full
                )),
                Err(e) => outcome.notes.push(format!("geocode failed for {}: {e}", cand.parsed.full)),
            }
        }

        groups.truncate(locations::MAX_LOCATIONS_PER_BUSINESS);

        for group in &groups {
            Self::insert_or_report_duplicate(pool, business_id, group, &existing, &mut outcome)
                .await?;
        }

        Ok(outcome)
    }

    /// Insert a geocoded candidate group into `business_locations`, or report
    /// it as a proximity duplicate when it geocodes within
    /// `locations::MERGE_DISTANCE_M` of a location already stored for the
    /// business.
    ///
    /// # Errors
    ///
    /// Returns an error when the insert query fails.
    async fn insert_or_report_duplicate(
        pool: &PgPool,
        business_id: Uuid,
        group: &GeocodedCandidate,
        existing: &[(f64, f64, String)],
        outcome: &mut locations::LocationDiscoveryOutcome,
    ) -> Result<(), String> {
        let address = group
            .addresses
            .iter()
            .max_by_key(|a| a.len())
            .cloned()
            .unwrap_or_default();
        let city = locations::parse_address(&address).map(|p| p.city).unwrap_or_default();
        let label = locations::pick_label(&group.labels, &city);
        if existing
            .iter()
            .any(|(elat, elng, _)| {
                locations::distance_m(*elat, *elng, group.lat, group.lng)
                    <= locations::MERGE_DISTANCE_M
            })
        {
            outcome.notes.push(format!(
                "{address} within 300 m of an existing location; skipped as duplicate"
            ));
            outcome.locations.push(locations::LocationDiscovered {
                label,
                address,
                lat: Some(group.lat),
                lng: Some(group.lng),
                inserted: false,
            });
            return Ok(());
        }
        let inserted = locations::insert_secondary_location(
            pool,
            business_id,
            &label,
            &address,
            Some(group.lat),
            Some(group.lng),
        )
        .await?;
        outcome.locations.push(locations::LocationDiscovered {
            label,
            address,
            lat: Some(group.lat),
            lng: Some(group.lng),
            inserted,
        });
        Ok(())
    }

    /// Enrich a batch of businesses. Each business is processed
    /// independently; a per-business failure is recorded on that entry's
    /// `error` and the remaining businesses still process to completion.
    pub async fn enrich_batch(
        &mut self,
        pool: &PgPool,
        business_ids: &[Uuid],
        dry_run: bool,
    ) -> Vec<EnrichResult> {
        let mut results = Vec::with_capacity(business_ids.len());
        for business_id in business_ids {
            results.push(self.enrich(pool, *business_id, dry_run).await);
        }
        results
    }

    /// Fetch a business homepage for menu discovery (robots check, rate
    /// limiting, UA rotation; 10 s timeout, 500 KB body cap). Depth 1:
    /// only the homepage itself, no sub-page crawling.
    ///
    /// # Errors
    ///
    /// Returns an error when the robots check blocks the URL, the request
    /// fails or exceeds the body cap, or the server answers a non-2xx
    /// status.
    pub async fn fetch_homepage(&mut self, url: &str) -> Result<String, String> {
        if !self.robots.is_allowed(url) {
            return Err("homepage fetch blocked by robots.txt".to_string());
        }
        self.limiter.wait_before_request().await;
        let user_agent = self.rotator.get_next_user_agent();
        let mut response = self
            .http
            .get(url)
            .timeout(Duration::from_secs(10))
            .header("User-Agent", user_agent)
            .header("Accept", "text/html")
            .send()
            .await
            .map_err(|e| format!("homepage fetch failed: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("homepage fetch failed: HTTP {}", status.as_u16()));
        }
        let mut body: Vec<u8> = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("homepage fetch failed: {e}"))?
        {
            if body.len() + chunk.len() > HOMEPAGE_BODY_CAP {
                return Err("homepage fetch failed: body exceeds 500 KB cap".to_string());
            }
            body.extend_from_slice(&chunk);
        }
        Ok(String::from_utf8_lossy(&body).into_owned())
    }

    /// HEAD-check a photo URL before `image_url` is written (stability
    /// gate).
    ///
    /// Passes only when the server answers a success status with an
    /// `image/*` content type. Google photo URLs are often time-limited,
    /// so a failing check means skip, not retry.
    ///
    /// # Errors
    ///
    /// Returns an error when the robots check blocks the URL, the HEAD
    /// request fails, the status is not success, or the content type is
    /// not an image.
    pub async fn head_photo(&mut self, url: &str) -> Result<(), String> {
        if !self.robots.is_allowed(url) {
            return Err("photo head check blocked by robots.txt".to_string());
        }
        self.limiter.wait_before_request().await;
        let user_agent = self.rotator.get_next_user_agent();
        let response = self
            .http
            .head(url)
            .timeout(Duration::from_secs(10))
            .header("User-Agent", user_agent)
            .send()
            .await
            .map_err(|e| format!("photo head check failed: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("photo head check failed: HTTP {}", status.as_u16()));
        }
        let Some(content_type) = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
        else {
            return Err("photo head check failed: no content type".to_string());
        };
        if !content_type.to_ascii_lowercase().starts_with("image/") {
            return Err(format!(
                "photo head check failed: non-image content type {content_type}"
            ));
        }
        Ok(())
    }

    /// Menu-discovery pass for one business (depth 1: homepage only, with a
    /// fallback to `SearXNG` results when the homepage cannot confirm the
    /// menu link).
    ///
    /// Runs only when the row has a non-empty website and an empty
    /// `menu_url` (fill-empty: an existing `menu_url` is never overwritten).
    /// A fetch failure leaves `menu_url` unchanged; the run keeps going.
    ///
    /// # Errors
    ///
    /// Returns an error when loading the business row fails.
    pub async fn discover_menu(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        dry_run: bool,
    ) -> Result<MenuOutcome, String> {
        let row = load_business(pool, business_id).await?;
        self.discover_menu_on_row(pool, business_id, &row, dry_run, &[]).await
    }

    /// Menu discovery against a pre-loaded row. [`Self::enrich`] uses this
    /// with the pre-run snapshot so a website written by this run's
    /// place-JSON pass is not fetched until the next run. When the
    /// homepage cannot confirm the menu link (fetch failed, or no
    /// menu-like link), [`find_menu_result`] looks for a menu page on
    /// the website's own host among `results`.
    async fn discover_menu_on_row(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        row: &BusinessRow,
        dry_run: bool,
        results: &[SearxngResult],
    ) -> Result<MenuOutcome, String> {
        let Some(website) = row.website.clone().filter(|v| !v.trim().is_empty()) else {
            return Ok(MenuOutcome::NotApplicable);
        };
        if row.menu_url.clone().as_ref().is_some_and(|v| !v.trim().is_empty()) {
            return Ok(MenuOutcome::NotApplicable);
        }

        let (url, from_homepage) = match self.fetch_homepage(&website).await {
            Ok(html) => match find_menu_url(&html, &website) {
                Some(url) => (url, true),
                None => match find_menu_result(results, &website) {
                    Some(url) => (url, false),
                    None => return Ok(MenuOutcome::NoMenuLink),
                },
            },
            Err(e) => match find_menu_result(results, &website) {
                Some(url) => (url, false),
                None => return Ok(MenuOutcome::FetchFailed(e)),
            },
        };

        if !dry_run {
            let affected =
                update_field(pool, business_id, "menu_url", &FieldValue::Text(url.clone())).await?;
            if !affected {
                // Lost the race: menu_url was filled between read and write.
                return Ok(MenuOutcome::NotApplicable);
            }
        }
        Ok(if from_homepage {
            MenuOutcome::Found(url)
        } else {
            MenuOutcome::FoundInResults(url)
        })
    }

    /// Photo-selection pass against a pre-loaded row and a parsed place.
    ///
    /// Runs only when the place JSON carries a photos array and the
    /// row's `image_url` is empty (fill-empty: an existing `image_url` is
    /// never overwritten). The first photo URL is HEAD-checked; a failing
    /// check leaves `image_url` unchanged.
    async fn discover_photo_on_place(
        &mut self,
        pool: &PgPool,
        business_id: Uuid,
        row: &BusinessRow,
        place: &PlaceData,
        dry_run: bool,
    ) -> Result<PhotoOutcome, String> {
        if row.image_url.clone().as_ref().is_some_and(|v| !v.trim().is_empty()) {
            return Ok(PhotoOutcome::NotApplicable);
        }
        let photo = match place.photos.as_ref().and_then(|v| v.first()) {
            Some(url) => url.clone(),
            None => return Ok(PhotoOutcome::NotApplicable),
        };

        match self.head_photo(&photo).await {
            Ok(()) => {
                if !dry_run {
                    let affected = update_field(
                        pool,
                        business_id,
                        "image_url",
                        &FieldValue::Text(photo.clone()),
                    )
                    .await?;
                    if !affected {
                        // Lost the race: image_url was filled between
                        // read and write.
                        return Ok(PhotoOutcome::NotApplicable);
                    }
                }
                Ok(PhotoOutcome::Selected(photo))
            }
            Err(detail) => Ok(PhotoOutcome::CheckFailed(detail)),
        }
    }
}

/// A geocoded location-discovery group: one or more address variants that
/// resolved to (approximately) the same place, plus their label votes.
/// Out-parameters written by `EnrichmentEngine::lookup_and_apply`: the
/// parsed place (consumed by the photo pass) and the raw `SearXNG` result
/// list (consumed by the location-discovery pass).
struct LookupOut {
    place: Option<PlaceData>,
    results: Option<Vec<SearxngResult>>,
}

#[derive(Debug)]
struct GeocodedCandidate {
    addresses: Vec<String>,
    labels: Vec<String>,
    lat: f64,
    lng: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use crate::rate_limiter::RateLimiterConfig;

    const FIXTURE_PLACE_JSON: &str =
        include_str!("../tests/fixtures/place-json/southern_kitchen.json");

    /// `SearXNG` search-response fixture: one result whose URL is the website
    /// and whose snippet carries the description and a US phone number.
    const FIXTURE_SEARXNG_RESULT: &str = r#"{
        "query": "ac2 fixture",
        "number_of_results": 1,
        "results": [
            {
                "url": "https://ac2-fixture.example/",
                "title": "AC2 Fixture Kitchen",
                "content": "AC2 fixture kitchen and bar. Call (404) 555-0142.",
                "engine": "searxng",
                "score": 1.0
            }
        ],
        "answers": [],
        "infoboxes": [],
        "suggestions": [],
        "articles": []
    }"#;

    fn fixture_place() -> PlaceData {
        parse_place_json(FIXTURE_PLACE_JSON).expect("fixture must parse")
    }

    fn empty_row(name: &str) -> BusinessRow {
        BusinessRow {
            id: Uuid::new_v4(),
            name: name.to_string(),
            location: None,
            phone: None,
            website: None,
            description: None,
            rating: Some(0.0),
            review_count: Some(0),
            menu_url: None,
            image_url: None,
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
            plan.skipped.contains(&"phone"),
            "pre-set phone must be reported skipped: skipped={:?} apply={:?}",
            plan.skipped,
            plan.apply
        );
        assert!(plan.skipped.contains(&"rating"));
        assert!(plan.skipped.contains(&"review_count"));
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

    /// Seed an admin user with a unique email; returns the user id.
    async fn seed_user(pool: &PgPool, email_prefix: &str, display_name: &str) -> Uuid {
        let email = format!("{email_prefix}{}@example.com", Uuid::new_v4());
        let row = sqlx::query(
            "INSERT INTO users (email, password_hash, name, role)
             VALUES ($1, 'test', $2, 'admin')
             RETURNING id",
        )
        .bind(&email)
        .bind(display_name)
        .fetch_one(pool)
        .await
        .expect("seed user inserts");
        row.get::<Uuid, _>("id")
    }

    /// Seed a scrape job; returns the job id.
    async fn seed_scrape_job(pool: &PgPool, query: &str) -> Uuid {
        let row = sqlx::query(
            "INSERT INTO scrape_jobs (source, query, location)
             VALUES ('ac2-test', $1, 'Test')
             RETURNING id",
        )
        .bind(query)
        .fetch_one(pool)
        .await
        .expect("seed scrape job");
        row.get::<Uuid, _>("id")
    }

    /// Seed an empty test business; returns the business id.
    async fn seed_business(pool: &PgPool, owner_id: Uuid, name: &str, phone: Option<&str>) -> Uuid {
        let row = sqlx::query(
            r"INSERT INTO businesses
               (owner_id, name, description, category_id, rating, review_count, phone, website, social_urls)
               VALUES ($1, $2, NULL, 'test-enrichment', 0, 0, $3, NULL, NULL)
               RETURNING id",
        )
        .bind(owner_id)
        .bind(name)
        .bind(phone)
        .fetch_one(pool)
        .await
        .expect("seed business inserts");
        row.get::<Uuid, _>("id")
    }

    /// Seed a `google_maps` source row for `name` — the enrichment
    /// eligibility gate.
    async fn seed_google_source(pool: &PgPool, job_id: Uuid, name: &str, source_id: &str) {
        sqlx::query(
            "INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id)
             VALUES ($1, 'google_maps', $2, $3)",
        )
        .bind(job_id)
        .bind(name)
        .bind(source_id)
        .execute(pool)
        .await
        .expect("seed source inserts");
    }

    /// Assert every content field of the row is still at its seeded empty state.
    async fn assert_row_unenriched(pool: &PgPool, business_id: Uuid) {
        let row = sqlx::query(
            r"SELECT phone, website, description, rating::text, review_count,
                      social_urls::text
               FROM businesses WHERE id = $1",
        )
        .bind(business_id)
        .fetch_one(pool)
        .await
        .expect("row reads back");
        assert!(row.get::<Option<String>, _>("phone").is_none());
        assert!(row.get::<Option<String>, _>("website").is_none());
        assert!(row.get::<Option<String>, _>("description").is_none());
        assert_eq!(
            row.get::<Option<String>, _>("rating").and_then(|raw| raw.parse::<f64>().ok()),
            Some(0.0)
        );
        assert_eq!(row.get::<Option<i32>, _>("review_count"), Some(0));
        assert!(row.get::<Option<String>, _>("social_urls").is_none());
    }

    /// Assert the AC2 `SearXNG` fixture landed: its three fields written,
    /// `rating`/`review_count` untouched.
    async fn assert_ac2_fixture_written(pool: &PgPool, business_id: Uuid) {
        let row = sqlx::query(
            "SELECT phone, website, description, rating::text, review_count FROM businesses WHERE id = $1",
        )
        .bind(business_id)
        .fetch_one(pool)
        .await
        .expect("row reads back");
        assert_eq!(row.get::<Option<String>, _>("phone").as_deref(), Some("(404) 555-0142"));
        assert_eq!(
            row.get::<Option<String>, _>("website").as_deref(),
            Some("https://ac2-fixture.example/")
        );
        assert_eq!(
            row.get::<Option<String>, _>("description").as_deref(),
            Some("AC2 fixture kitchen and bar. Call (404) 555-0142.")
        );
        assert_eq!(
            row.get::<Option<String>, _>("rating").and_then(|raw| raw.parse::<f64>().ok()),
            Some(0.0)
        );
        assert_eq!(row.get::<Option<i32>, _>("review_count"), Some(0));
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

        let user_id = seed_user(&pool, "enrich-test-", "Enrich Test").await;

        let business_id = seed_business(&pool, user_id, "Enrichment Test Business", None).await;

        let (applied, skipped) =
            apply_fill_empty(&pool, business_id, &place, false)
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
            r"SELECT phone, website, description, rating::text, review_count,
                      rating_source, social_urls::text
               FROM businesses WHERE id = $1",
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
        let business_id2 = seed_business(&pool, user_id, "Enrichment Test Business 2", Some("+15550001111")).await;

        let place2 = PlaceData {
            phone: Some("+15559998888".to_string()),
            description: Some("Text from Google".to_string()),
            ..PlaceData::default()
        };
        let (applied2, skipped2) =
            apply_fill_empty(&pool, business_id2, &place2, false)
                .await
                .expect("apply succeeds for the partial row");

        assert!(
            skipped2.contains(&"phone"),
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

    fn ac2_test_engine(proxy_port: u16) -> EnrichmentEngine {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .proxy(
                reqwest::Proxy::http(format!("http://127.0.0.1:{proxy_port}"))
                    .expect("stub proxy builds"),
            )
            .build()
            .expect("test client builds");
        let geocoder = locations::Geocoder::new(&http, "http://nominatim.test");
        EnrichmentEngine {
            http,
            limiter: RateLimiter::with_config(RateLimiterConfig {
                min_delay_ms: 0,
                max_jitter_ms: 0,
            }),
            rotator: UserAgentRotator::new(),
            robots: RobotsChecker::new(),
            searxng_base: "http://searxng.test".to_string(),
            geocoder,
        }
    }

    /// Minimal blocking HTTP/1.1 stub: replies 500 when the request line
    /// contains `fail_marker`, otherwise 200 with `success_body`.
    fn ac2_start_http_stub(fail_marker: &str, success_body: &str) -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind AC2 stub listener");
        let port = listener.local_addr().expect("AC2 stub address").port();
        let fail_marker = fail_marker.to_string();
        let success_body = success_body.to_string();
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
                            if head.windows(4).any(|window| window == b"\r\n\r\n") {
                                break;
                            }
                        }
                    }
                }
                let request_line = String::from_utf8_lossy(&head)
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                if request_line.contains(fail_marker.as_str()) {
                    let response = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                } else {
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        success_body.len(),
                        success_body
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
            }
        });
        port
    }

    // AC2: a non-success SearXNG lookup becomes the exact run-report error.
    #[tokio::test]
    async fn test_fetch_place_data_reports_http_500() {
        let port = ac2_start_http_stub("ac2-fail", "{}");
        let mut engine = ac2_test_engine(port);

        let err = engine
            .fetch_place_data("ac2-fail business", "")
            .await
            .expect_err("HTTP 500 must be reported as an error");

        assert_eq!(err, "searxng lookup failed: HTTP 500");
    }

    /// `place_from_results` maps `website`/`description` from the top
    /// result only; an empty list yields `None` (regression guard for
    /// the fetch/derive split).
    #[test]
    fn test_place_from_results_maps_top_result_only() {
        let results = vec![SearxngResult {
            url: "https://example.test/kitchen".to_string(),
            title: "Example Kitchen".to_string(),
            content: Some("Great kitchen. Call (404) 555-0199.".to_string()),
            engine: None,
            engines: vec![],
            score: None,
            img_src: None,
        }];
        let place =
            EnrichmentEngine::place_from_results(&results, "Example Kitchen")
                .expect("top result maps");
        assert_eq!(place.phone.as_deref(), Some("(404) 555-0199"));
        assert_eq!(place.website.as_deref(), Some("https://example.test/kitchen"));
        assert_eq!(
            place.description.as_deref(),
            Some("Great kitchen. Call (404) 555-0199.")
        );
        assert!(EnrichmentEngine::place_from_results(&[], "Example Kitchen").is_none());
    }

    /// `phone` is mined across ranked snippets, not just the top
    /// result: a phone absent from the top snippet is found in the
    /// first lower result titled with the business name, while
    /// results that do not mention the business are skipped even when
    /// they rank higher (cross-business contamination guard).
    #[test]
    fn test_place_from_results_mines_phone_from_ranked_snippets() {
        let results = vec![
            SearxngResult {
                url: "https://example.test/kitchen".to_string(),
                title: "Example Kitchen: Home".to_string(),
                content: Some("Great kitchen in town.".to_string()),
                engine: None,
                engines: vec![],
                score: None,
                img_src: None,
            },
            SearxngResult {
                url: "https://listicle.test/best-kitchens".to_string(),
                title: "Ten Best Kitchens in Town".to_string(),
                content: Some("Rival spot: call (404) 555-7777.".to_string()),
                engine: None,
                engines: vec![],
                score: None,
                img_src: None,
            },
            SearxngResult {
                url: "https://directory.test/example-kitchen".to_string(),
                title: "Example Kitchen | City Directory".to_string(),
                content: Some("Call (404) 555-0199 for reservations.".to_string()),
                engine: None,
                engines: vec![],
                score: None,
                img_src: None,
            },
        ];
        let place =
            EnrichmentEngine::place_from_results(&results, "Example Kitchen")
                .expect("top result maps");
        assert_eq!(place.phone.as_deref(), Some("(404) 555-0199"));
        assert_eq!(place.website.as_deref(), Some("https://example.test/kitchen"));
    }

    /// Phone eligibility: a snippet that does not mention the business
    /// by name is never taken, even when it ranks above a matching
    /// result; the top result's snippet stays eligible without a title
    /// match (back-compat with the single-payload lookup).
    #[test]
    fn test_place_from_results_phone_eligibility_rules() {
        let foreign_only = vec![
            SearxngResult {
                url: "https://example.test/kitchen".to_string(),
                title: "Example Kitchen: Home".to_string(),
                content: Some("Great kitchen in town.".to_string()),
                engine: None,
                engines: vec![],
                score: None,
                img_src: None,
            },
            SearxngResult {
                url: "https://listicle.test/best-kitchens".to_string(),
                title: "Ten Best Kitchens in Town".to_string(),
                content: Some("Rival spot: call (404) 555-7777.".to_string()),
                engine: None,
                engines: vec![],
                score: None,
                img_src: None,
            },
        ];
        let place =
            EnrichmentEngine::place_from_results(&foreign_only, "Example Kitchen")
                .expect("top result maps");
        assert!(
            place.phone.is_none(),
            "foreign-titled snippet must not supply a phone"
        );

        let top_unmatched = vec![SearxngResult {
            url: "https://example.test/kitchen".to_string(),
            title: "A Local Eats Roundup".to_string(),
            content: Some("Great kitchen. Call (404) 555-0199.".to_string()),
            engine: None,
            engines: vec![],
            score: None,
            img_src: None,
        }];
        let place =
            EnrichmentEngine::place_from_results(&top_unmatched, "Example Kitchen")
                .expect("top result maps");
        assert_eq!(
            place.phone.as_deref(),
            Some("(404) 555-0199"),
            "top snippet is always eligible"
        );
    }

    /// Multi-host stub: answers `searxng.test` with the `SearXNG` body and
    /// `nominatim.test` with the Nominatim body. Requests arrive in
    /// absolute form through the proxy, so the host is visible on the
    /// request line.
    fn start_dual_stub(searxng_body: &str, nominatim_body: &str) -> u16 {
        let listener =
            std::net::TcpListener::bind("127.0.0.1:0").expect("bind dual stub listener");
        let port = listener.local_addr().expect("dual stub address").port();
        let searxng_body = searxng_body.to_string();
        let nominatim_body = nominatim_body.to_string();
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
                let request_line = String::from_utf8_lossy(&head)
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                let body = if request_line.contains("nominatim.test") {
                    nominatim_body.clone()
                } else {
                    searxng_body.clone()
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
        port
    }

    const LOC_DISCOVERY_SEARXNG: &str = r#"{
        "query": "ac10 loc bistro",
        "number_of_results": 2,
        "results": [
            {
                "url": "https://opentable.test/r/ac10-loc-bistro-west-springfield",
                "title": "AC10 Loc Bistro - West, Springfield, IL - OpenTable",
                "content": "421 West Ave, Ste 2, Springfield, IL 62704 - About this restaurant",
                "engine": "opentable",
                "score": 1.0
            },
            {
                "url": "https://yelp.test/biz/ac10-loc-bistro",
                "title": "AC10 Loc Bistro - Restaurant Reviews - Yelp",
                "content": "AC10 Loc Bistro - Try Our New Menu",
                "engine": "yelp",
                "score": 0.9
            }
        ],
        "unresponsive_engines": []
    }"#;

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

    const LOC_DISCOVERY_NEAR_SEARXNG: &str = r#"{
        "query": "ac11 loc bistro",
        "number_of_results": 1,
        "results": [
            {
                "url": "https://opentable.test/r/ac11-loc-bistro-west-springfield",
                "title": "AC11 Loc Bistro - West, Springfield, IL - OpenTable",
                "content": "421 West Ave, Ste 2, Springfield, IL 62704 - About this restaurant",
                "engine": "opentable",
                "score": 1.0
            }
        ],
        "unresponsive_engines": []
    }"#;

    // Location discovery: a venue title + snippet address produce one
    // secondary `business_locations` row, the primary row is ensured from
    // the `businesses` row, and a re-run dedupes to zero new rows.
    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn test_discover_locations_writes_secondary_and_primary() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let name = "AC10 Loc Bistro";
        sqlx::query(
            "DELETE FROM business_locations WHERE business_id IN (SELECT id FROM businesses WHERE name = $1)",
        )
        .bind(name)
        .execute(&pool)
        .await
        .expect("cleanup locations");
        sqlx::query("DELETE FROM businesses WHERE name = $1")
            .bind(name)
            .execute(&pool)
            .await
            .expect("cleanup business");
        sqlx::query("DELETE FROM scraped_businesses WHERE name = $1")
            .bind(name)
            .execute(&pool)
            .await
            .expect("cleanup scraped");

        let stub_port = start_dual_stub(LOC_DISCOVERY_SEARXNG, LOC_DISCOVERY_NOMINATIM);
        let mut engine = ac2_test_engine(stub_port);

        let user_id = seed_user(&pool, "ac10-loc-", "AC10 Loc").await;
        let job_id = seed_scrape_job(&pool, "ac10 loc").await;
        let biz_id = seed_business(&pool, user_id, name, None).await;

        // Give the row a real primary address + coordinates so the state
        // guard, primary exclusion, and primary-ensure paths all run.
        // Keep the primary's coordinates far from the candidate's geocode
        // (39.797, -89.647) so the proximity gate does not skip the
        // secondary insert. The city stays Springfield so the state guard
        // still passes.
        sqlx::query("UPDATE businesses SET location = $2, lat = 39.70, lng = -89.75 WHERE id = $1")
            .bind(biz_id)
            .bind("10 Main St, Springfield, IL 62701")
            .execute(&pool)
            .await
            .expect("primary address seeded");
        seed_google_source(&pool, job_id, name, "http://maps.google.test/maps/ok?cid=ac10-loc").await;

        let row = load_business(&pool, biz_id).await.expect("business loads");
        let fixture: serde_json::Value =
            serde_json::from_str(LOC_DISCOVERY_SEARXNG).expect("fixture parses");
        let results: Vec<SearxngResult> =
            serde_json::from_value(fixture["results"].clone()).expect("fixture results parse");

        let outcome = engine
            .discover_locations_on_results(&pool, biz_id, name, &results, &row, false)
            .await
            .expect("discovery succeeds");

        assert!(outcome.primary_added, "primary row must be ensured");
        assert_eq!(
            outcome.locations.len(),
            1,
            "one secondary location expected: {outcome:?}"
        );
        let found = &outcome.locations[0];
        assert!(found.inserted);
        assert_eq!(found.label.as_deref(), Some("West"));
        assert_eq!(found.address, "421 West Ave, Ste 2, Springfield, IL 62704");
        assert_eq!(found.lat, Some(39.797));
        assert_eq!(found.lng, Some(-89.647));

        let rows = sqlx::query(
            "SELECT label, address, is_primary FROM business_locations WHERE business_id = $1 ORDER BY is_primary DESC",
        )
        .bind(biz_id)
        .fetch_all(&pool)
        .await
        .expect("location rows read");
        assert_eq!(rows.len(), 2, "primary + one secondary");
        let primary = &rows[0];
        assert!(primary.get::<bool, _>("is_primary"));
        assert_eq!(
            primary.get::<Option<String>, _>("address").as_deref(),
            Some("10 Main St, Springfield, IL 62701")
        );
        let secondary = &rows[1];
        assert!(!secondary.get::<bool, _>("is_primary"));
        assert_eq!(
            secondary.get::<Option<String>, _>("address").as_deref(),
            Some("421 West Ave, Ste 2, Springfield, IL 62704")
        );
        assert_eq!(secondary.get::<Option<String>, _>("label").as_deref(), Some("West"));

        // Re-run: the same address is already stored -> deduped, no new row.
        let outcome2 = engine
            .discover_locations_on_results(&pool, biz_id, name, &results, &row, false)
            .await
            .expect("second discovery succeeds");
        assert_eq!(outcome2.locations.len(), 1);
        assert!(!outcome2.locations[0].inserted, "repeat address must dedupe");
        assert!(!outcome2.primary_added, "primary already exists");

        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM business_locations WHERE business_id = $1",
        )
        .bind(biz_id)
        .fetch_one(&pool)
        .await
        .expect("count reads");
        assert_eq!(count, 2, "re-run must not duplicate rows");

        // Cleanup: seeded rows only.
        sqlx::query("DELETE FROM business_locations WHERE business_id = $1")
            .bind(biz_id)
            .execute(&pool)
            .await
            .expect("cleanup locations");
        sqlx::query("DELETE FROM businesses WHERE id = $1")
            .bind(biz_id)
            .execute(&pool)
            .await
            .expect("cleanup business");
        sqlx::query("DELETE FROM scraped_businesses WHERE scrape_job_id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scraped businesses cleanup");
        sqlx::query("DELETE FROM scrape_jobs WHERE id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scrape job cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("user cleanup");
    }

    // Proximity merge against existing rows: a candidate that geocodes
    // within 300 m of an already-stored location is reported but not
    // inserted, so re-discovery of an OCR/typo variant never duplicates a
    // row.
    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn test_discover_locations_skips_candidate_near_existing_row() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let name = "AC11 Loc Bistro";
        sqlx::query(
            "DELETE FROM business_locations WHERE business_id IN (SELECT id FROM businesses WHERE name = $1)",
        )
        .bind(name)
        .execute(&pool)
        .await
        .expect("cleanup locations");
        sqlx::query("DELETE FROM businesses WHERE name = $1")
            .bind(name)
            .execute(&pool)
            .await
            .expect("cleanup business");
        sqlx::query("DELETE FROM scraped_businesses WHERE name = $1")
            .bind(name)
            .execute(&pool)
            .await
            .expect("cleanup scraped");

        let stub_port = start_dual_stub(LOC_DISCOVERY_NEAR_SEARXNG, LOC_DISCOVERY_NOMINATIM);
        let mut engine = ac2_test_engine(stub_port);

        let user_id = seed_user(&pool, "ac11-loc-", "AC11 Loc").await;
        let job_id = seed_scrape_job(&pool, "ac11 loc").await;
        let biz_id = seed_business(&pool, user_id, name, None).await;

        // Primary far from the candidate's geocode (39.797, -89.647); a
        // pre-existing secondary sits ~14 m from that geocode, well inside
        // the 300 m merge radius.
        sqlx::query("UPDATE businesses SET location = $2, lat = 39.70, lng = -89.75 WHERE id = $1")
            .bind(biz_id)
            .bind("10 Main St, Springfield, IL 62701")
            .execute(&pool)
            .await
            .expect("primary address seeded");
        sqlx::query(
            "INSERT INTO business_locations (business_id, label, address, lat, lng, is_primary)
             VALUES ($1, 'West', '421 West Ave Ste 2 Springfield IL', 39.7971, -89.6471, false)",
        )
        .bind(biz_id)
        .execute(&pool)
        .await
        .expect("pre-existing secondary seeded");
        seed_google_source(&pool, job_id, name, "http://maps.google.test/maps/ok?cid=ac11-loc").await;

        let row = load_business(&pool, biz_id).await.expect("business loads");
        let fixture: serde_json::Value =
            serde_json::from_str(LOC_DISCOVERY_NEAR_SEARXNG).expect("fixture parses");
        let results: Vec<SearxngResult> =
            serde_json::from_value(fixture["results"].clone()).expect("fixture results parse");

        let outcome = engine
            .discover_locations_on_results(&pool, biz_id, name, &results, &row, false)
            .await
            .expect("discovery succeeds");

        assert!(outcome.primary_added, "primary row must be ensured");
        assert_eq!(
            outcome.locations.len(),
            1,
            "one candidate expected: {outcome:?}"
        );
        assert!(
            !outcome.locations[0].inserted,
            "candidate within 300 m of a stored row must not insert: {outcome:?}"
        );
        assert!(
            outcome
                .notes
                .iter()
                .any(|n| n.contains("skipped as duplicate")),
            "proximity skip should be noted: {outcome:?}"
        );

        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM business_locations WHERE business_id = $1",
        )
        .bind(biz_id)
        .fetch_one(&pool)
        .await
        .expect("count reads");
        assert_eq!(count, 2, "primary + pre-existing row, no duplicate");

        // Cleanup: seeded rows only.
        sqlx::query("DELETE FROM business_locations WHERE business_id = $1")
            .bind(biz_id)
            .execute(&pool)
            .await
            .expect("cleanup locations");
        sqlx::query("DELETE FROM businesses WHERE id = $1")
            .bind(biz_id)
            .execute(&pool)
            .await
            .expect("cleanup business");
        sqlx::query("DELETE FROM scraped_businesses WHERE scrape_job_id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scraped businesses cleanup");
        sqlx::query("DELETE FROM scrape_jobs WHERE id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scrape job cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("user cleanup");
    }

    // AC2 scenario 1: a per-business HTTP failure is isolated in the run
    // report while the remaining businesses still process to completion.
    #[tokio::test]
    async fn test_enrich_batch_isolates_per_business_fetch_failure() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        sqlx::query(
            "DELETE FROM businesses WHERE name IN ('AC2 Batch Business 1', 'AC2 Batch Business 3', 'AC2 Batch Business 5')",
        )
        .execute(&pool)
        .await
        .expect("cleanup businesses");
        sqlx::query(
            "DELETE FROM scraped_businesses WHERE name IN ('AC2 Batch Business 1', 'AC2 Batch Business 3', 'AC2 Batch Business 5')",
        )
        .execute(&pool)
        .await
        .expect("cleanup scraped businesses");

        let stub_port = ac2_start_http_stub("Business+3", FIXTURE_SEARXNG_RESULT);
        let mut engine = ac2_test_engine(stub_port);

        let user_id = seed_user(&pool, "ac2-batch-", "AC2 Batch").await;

        let job_id = seed_scrape_job(&pool, "ac2 batch").await;

        let b1_id = seed_business(&pool, user_id, "AC2 Batch Business 1", None).await;
        let b3_id = seed_business(&pool, user_id, "AC2 Batch Business 3", None).await;
        let b5_id = seed_business(&pool, user_id, "AC2 Batch Business 5", None).await;

        seed_google_source(
            &pool,
            job_id,
            "AC2 Batch Business 1",
            "http://maps.google.test/maps/ok?cid=ac2-one",
        )
        .await;
        seed_google_source(
            &pool,
            job_id,
            "AC2 Batch Business 3",
            "http://maps.google.test/maps/fail?cid=ac2-three",
        )
        .await;
        seed_google_source(
            &pool,
            job_id,
            "AC2 Batch Business 5",
            "http://maps.google.test/maps/ok?cid=ac2-five",
        )
        .await;

        // b-3 fails first; b-1 and b-5 must still process to completion.
        let report = engine.enrich_batch(&pool, &[b3_id, b1_id, b5_id], false).await;

        assert_eq!(report.len(), 3, "run report must include every business in the batch");

        let failed = &report[0];
        assert_eq!(failed.business_id, b3_id);
        assert_eq!(failed.error.as_deref(), Some("searxng lookup failed: HTTP 500"));
        assert!(failed.applied.is_empty(), "failed fetch must apply nothing");

        let b1 = &report[1];
        assert_eq!(b1.business_id, b1_id);
        assert!(b1.error.is_none(), "b-1 must not error even though b-3 failed first");
        let b1_fields: Vec<&str> = b1.applied.iter().map(|a| a.field).collect();
        assert_eq!(
            b1_fields,
            vec!["phone", "website", "description"],
            "SearXNG fixture fills exactly its three fields: {b1_fields:?}"
        );

        let b5 = &report[2];
        assert_eq!(b5.business_id, b5_id);
        assert!(b5.error.is_none(), "business after the failure must still process to completion");
        let b5_fields: Vec<&str> = b5.applied.iter().map(|a| a.field).collect();
        assert_eq!(
            b5_fields,
            vec!["phone", "website", "description"],
            "SearXNG fixture fills exactly its three fields: {b5_fields:?}"
        );

        // b-3's row is unchanged.
        assert_row_unenriched(&pool, b3_id).await;

        // b-1 actually landed on the row (SearXNG fixture: phone,
        // website, description — no rating/review_count).
        assert_ac2_fixture_written(&pool, b1_id).await;

        // Cleanup: seeded rows only.
        sqlx::query("DELETE FROM businesses WHERE id = ANY($1)")
            .bind(vec![b1_id, b3_id, b5_id])
            .execute(&pool)
            .await
            .expect("business cleanup");
        sqlx::query("DELETE FROM scraped_businesses WHERE scrape_job_id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scraped businesses cleanup");
        sqlx::query("DELETE FROM scrape_jobs WHERE id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scrape job cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("user cleanup");
    }

    // AC2 scenario 2: a business whose source is not a Google share link is
    // reported as skipped with a reason, no error raised.
    #[tokio::test]
    async fn test_enrich_batch_reports_no_enrichment_source_without_error() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        sqlx::query("DELETE FROM businesses WHERE name = 'AC2 Batch Business 4'")
            .execute(&pool)
            .await
            .expect("cleanup business");
        sqlx::query("DELETE FROM scraped_businesses WHERE name = 'AC2 Batch Business 4'")
            .execute(&pool)
            .await
            .expect("cleanup scraped business");

        let mut engine = EnrichmentEngine::new("http://searxng.test");

        let user_id = seed_user(&pool, "ac2-nosrc-", "AC2 NoSource").await;

        let job_id = seed_scrape_job(&pool, "ac2 no source").await;

        let b4_id = seed_business(&pool, user_id, "AC2 Batch Business 4", None).await;

        sqlx::query(
            "INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id)
             VALUES ($1, 'searxng', 'AC2 Batch Business 4', 'https://searxng.example/result/ac2-four')",
        )
        .bind(job_id)
        .execute(&pool)
        .await
        .expect("seed b-4 source");

        let report = engine.enrich_batch(&pool, &[b4_id], false).await;

        assert_eq!(report.len(), 1, "run report must include the business");
        let entry = &report[0];
        assert_eq!(entry.business_id, b4_id);
        assert_eq!(entry.business_name, "AC2 Batch Business 4");
        assert_eq!(entry.reason, Some("no enrichment source"));
        assert!(entry.error.is_none(), "ineligible source must not raise an error");
        assert!(entry.applied.is_empty());

        assert_row_unenriched(&pool, b4_id).await;

        sqlx::query("DELETE FROM businesses WHERE id = $1")
            .bind(b4_id)
            .execute(&pool)
            .await
            .expect("business cleanup");
        sqlx::query("DELETE FROM scraped_businesses WHERE scrape_job_id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scraped business cleanup");
        sqlx::query("DELETE FROM scrape_jobs WHERE id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scrape job cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("user cleanup");
    }

    // AC3: Reruns are idempotent — a fully enriched row must report every
    // target field as skipped and produce nothing to write.
    #[test]
    fn test_plan_rerun_fully_enriched_row_skips_all_fields() {
        let mut row = empty_row("b-5");
        let place = fixture_place();
        row.phone = place.phone.clone();
        row.website = place.website.clone();
        row.description = place.description.clone();
        row.rating = place.rating;
        row.review_count = place.review_count;
        row.social_urls = place
            .social_urls
            .as_ref()
            .map(|v| serde_json::to_value(v).expect("SocialUrl serializes"));

        let plan = plan_fill_empty(&row, &place);

        assert!(
            plan.apply.is_empty(),
            "fully enriched row must produce no writes, got {:?}",
            plan.apply
        );
        let skipped: Vec<&str> = plan.skipped;
        assert_eq!(
            skipped,
            vec!["phone", "website", "description", "rating", "review_count", "social"]
        );
    }

    /// Column-level snapshot of every column enrichment may write, read back
    /// as text so a stray UPDATE on rerun — even one writing an identical
    /// value — is detectable through `updated_at`.
    async fn row_snapshot(
        pool: &PgPool,
        business_id: Uuid,
    ) -> Vec<(String, Option<String>)> {
        let row = sqlx::query(
            r"SELECT phone, website, description, rating::text AS rating,
                      review_count::text AS review_count, rating_source,
                      social_urls::text AS social_urls, updated_at::text AS updated_at
               FROM businesses WHERE id = $1",
        )
        .bind(business_id)
        .fetch_one(pool)
        .await
        .expect("row snapshot reads back");
        let cols = [
            "phone",
            "website",
            "description",
            "rating",
            "review_count",
            "rating_source",
            "social_urls",
            "updated_at",
        ];
        cols.iter()
            .map(|c| {
                (
                    c.to_string(),
                    row.try_get::<Option<String>, _>(c).expect("column reads back"),
                )
            })
            .collect()
    }

    // AC3: b-5 is fully enriched by a previous run; running the engine again
    // reports every target field skipped, applies zero UPDATEs, and leaves
    // rating_source 'google'.
    #[tokio::test]
    async fn test_rerun_is_idempotent_all_fields_skipped() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        // Idempotent cleanup of residue from prior runs.
        sqlx::query(
            "DELETE FROM businesses WHERE name = 'Enrichment Test Business 5'",
        )
        .execute(&pool)
        .await
        .expect("cleanup delete");

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
                r"INSERT INTO businesses
                   (owner_id, name, description, category_id, rating, review_count, phone, website, social_urls)
                   VALUES ($1, 'Enrichment Test Business 5', NULL, 'test-enrichment', 0, 0, NULL, NULL, NULL)
                   RETURNING id",
            )
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .expect("seed business b-5 inserts");
            row.get::<Uuid, _>("id")
        };

        let place = fixture_place();

        // Run 1 (previous run): fully enriches b-5.
        let (applied1, skipped1) =
            apply_fill_empty(&pool, business_id, &place, false)
                .await
                .expect("first run applies on the compose Postgres");
        let fields1: Vec<&str> = applied1.iter().map(|a| a.field).collect();
        assert_eq!(
            fields1,
            vec!["phone", "website", "description", "rating", "review_count", "social"]
        );
        assert!(
            skipped1.is_empty(),
            "first run: nothing should skip, got {skipped1:?}"
        );

        let before = row_snapshot(&pool, business_id).await;

        // Run 2 (rerun): same business, same place JSON.
        let (applied2, skipped2) =
            apply_fill_empty(&pool, business_id, &place, false)
                .await
                .expect("second run completes on the compose Postgres");

        // Every target field is reported skipped…
        assert_eq!(
            skipped2,
            vec!["phone", "website", "description", "rating", "review_count", "social"]
        );
        // …and zero UPDATE statements apply (no field reports as applied).
        assert!(
            applied2.is_empty(),
            "rerun must apply zero fields, got {applied2:?}"
        );

        // Row is byte-identical after the rerun — no value, timestamp, or
        // source change.
        let after = row_snapshot(&pool, business_id).await;
        assert_eq!(
            after, before,
            "rerun must leave the enriched row untouched"
        );
        let rating_source = after
            .iter()
            .find(|(k, _)| k == "rating_source")
            .and_then(|(_, v)| v.clone());
        assert_eq!(
            rating_source.as_deref(),
            Some("google"),
            "rating_source must remain 'google' after the rerun"
        );

        // Cleanup: remove seeded rows (compose dev DB, kept tidy).
        sqlx::query("DELETE FROM businesses WHERE id = $1")
            .bind(business_id)
            .execute(&pool)
            .await
            .expect("business cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("user cleanup");
    }

    // LOC-0081-AC1: menu discovery from the homepage

    const FIXTURE_MENU_HOMEPAGE: &str =
        include_str!("../tests/fixtures/homepage/menu_homepage.html");
    const FIXTURE_NO_MENU_HOMEPAGE: &str =
        include_str!("../tests/fixtures/homepage/no_menu_homepage.html");

    #[test]
    fn test_find_menu_url_first_menu_link_wins() {
        let found = find_menu_url(FIXTURE_MENU_HOMEPAGE, "https://example.com")
            .expect("fixture homepage carries a menu link");

        // Document order: the /menu link comes before the .pdf link.
        assert_eq!(found, "https://example.com/menu");
    }

    #[test]
    fn test_find_menu_url_no_menu_like_link_returns_none() {
        let found = find_menu_url(FIXTURE_NO_MENU_HOMEPAGE, "https://example.com");

        assert_eq!(found, None);
    }

    #[test]
    fn test_find_menu_url_matches_pdf_and_case_insensitive_paths() {
        let html = r#"<html><body>
            <a href="/food-menu.PDF">PDF</a>
        </body></html>"#;
        assert_eq!(
            find_menu_url(html, "https://example.com").as_deref(),
            Some("https://example.com/food-menu.PDF")
        );

        let html = r#"<html><body>
            <a href="/MENU-BOARD">Board</a>
        </body></html>"#;
        assert_eq!(
            find_menu_url(html, "https://example.com").as_deref(),
            Some("https://example.com/MENU-BOARD")
        );
    }

    #[test]
    fn test_find_menu_url_resolves_relative_and_dotted_paths() {
        let html = r#"<html><body>
            <a href="../../menu">Up two levels</a>
            <a href="./sub/menu">Relative dir</a>
        </body></html>"#;

        // First match wins: the "../../menu" link resolves to /menu.
        assert_eq!(
            find_menu_url(html, "https://example.com/pages/deep/leaf.html").as_deref(),
            Some("https://example.com/menu")
        );

        let html = r#"<html><body>
            <a href="./sub/menu">Relative dir</a>
        </body></html>"#;
        assert_eq!(
            find_menu_url(html, "https://example.com/pages/").as_deref(),
            Some("https://example.com/pages/sub/menu")
        );
    }

    #[test]
    fn test_find_menu_url_skips_non_web_schemes_and_bare_fragments() {
        let html = r##"<html><body>
            <a href="mailto:owner@example.com">Email</a>
            <a href="tel:+15550100">Call</a>
            <a href="javascript:void(0)">JS</a>
            <a href="#main">Fragment only</a>
            <a href="/menu">Menu</a>
        </body></html>"##;

        assert_eq!(
            find_menu_url(html, "https://example.com").as_deref(),
            Some("https://example.com/menu")
        );
    }

    #[test]
    fn test_find_menu_url_accepts_single_quoted_and_unquoted_hrefs() {
        let html = r"<html><body>
            <a href='/menu-single'>Single</a>
            <a href=menu-unquoted>Unquoted</a>
        </body></html>";

        assert_eq!(
            find_menu_url(html, "https://example.com").as_deref(),
            Some("https://example.com/menu-single")
        );
    }

    #[test]
    fn test_find_menu_url_matching_is_path_based() {
        let html = r#"<html><body>
            <a href="/menu?cat=food#top">Menu</a>
        </body></html>"#;
        assert_eq!(
            find_menu_url(html, "https://example.com").as_deref(),
            // Fragment is dropped from the stored URL; the query survives.
            Some("https://example.com/menu?cat=food")
        );

        // A "menu" that only lives in the query string is not a menu page:
        // matching is path-based.
        let html = r#"<html><body>
            <a href="/about?highlight=menu">About</a>
        </body></html>"#;
        assert_eq!(find_menu_url(html, "https://example.com"), None);
    }

    /// The `SearXNG` menu fallback only picks menu-like results on
    /// the website's own host (case- and `www.`-insensitive), in rank
    /// order; aggregator results and other hosts are ignored.
    #[test]
    fn test_find_menu_result_requires_same_host() {
        let results = vec![
            SearxngResult {
                url: "https://aggregator.example/best-menus".to_string(),
                title: "Best menus in town".to_string(),
                content: Some("a list of menus".to_string()),
                engine: None,
                engines: vec![],
                score: None,
                img_src: None,
            },
            SearxngResult {
                url: "https://www.example.com/menu".to_string(),
                title: "Menu".to_string(),
                content: None,
                engine: None,
                engines: vec![],
                score: None,
                img_src: None,
            },
        ];
        assert_eq!(
            find_menu_result(&results, "https://example.com/"),
            Some("https://www.example.com/menu".to_string())
        );
        // No menu-like result on the requested host -> None.
        assert_eq!(find_menu_result(&results, "https://other.com/"), None);
        assert!(find_menu_result(&[], "https://example.com/").is_none());
    }

    /// Menu-likeness also matches on the result title when the path is
    /// unmarked; a "menu" that only lives in the query string never counts.
    #[test]
    fn test_find_menu_result_title_match() {
        let results = vec![SearxngResult {
            url: "https://example.com/dinner".to_string(),
            title: "Menu - Example Kitchen".to_string(),
            content: None,
            engine: None,
            engines: vec![],
            score: None,
            img_src: None,
        }];
        assert_eq!(
            find_menu_result(&results, "https://example.com"),
            Some("https://example.com/dinner".to_string())
        );

        let query_only = vec![SearxngResult {
            url: "https://example.com/?highlight=menu".to_string(),
            title: "Example Kitchen".to_string(),
            content: None,
            engine: None,
            engines: vec![],
            score: None,
            img_src: None,
        }];
        assert_eq!(find_menu_result(&query_only, "https://example.com"), None);
    }

    /// Seed an admin user and a business row with the given website;
    /// returns (`user_id`, `business_id`). No `scraped_businesses` row: the
    /// business has no place-JSON source, so only the menu pass acts.
    async fn ac1_seed_business_with_website(pool: &PgPool, website: &str) -> (Uuid, Uuid) {
        let email = format!("ac1-menu-{}@example.com", Uuid::new_v4());
        let user_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, 'test', 'AC1 Menu', 'admin')
                 RETURNING id",
            )
            .bind(&email)
            .fetch_one(pool)
            .await
            .expect("seed user inserts");
            row.get::<Uuid, _>("id")
        };
        let business_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO businesses (owner_id, name, category_id, website)
                 VALUES ($1, $2, 'test-enrichment', $3)
                 RETURNING id",
            )
            .bind(user_id)
            .bind(format!("AC1 Menu Business {}", Uuid::new_v4()))
            .bind(website)
            .fetch_one(pool)
            .await
            .expect("seed business inserts");
            row.get::<Uuid, _>("id")
        };
        (user_id, business_id)
    }

    async fn ac1_cleanup_business(pool: &PgPool, user_id: Uuid, business_id: Uuid) {
        sqlx::query("DELETE FROM businesses WHERE id = $1")
            .bind(business_id)
            .execute(pool)
            .await
            .expect("business cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(pool)
            .await
            .expect("user cleanup");
    }

    /// AC1: a business with a website and NULL `menu_url` gets `menu_url`
    /// written from the first menu-like link on the homepage.
    #[tokio::test]
    async fn test_discover_menu_writes_first_menu_link_from_homepage() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let stub_port = ac2_start_http_stub("/__never__", FIXTURE_MENU_HOMEPAGE);
        let mut engine = ac2_test_engine(stub_port);

        let website = format!("http://127.0.0.1:{stub_port}/");
        let (user_id, business_id) =
            ac1_seed_business_with_website(&pool, &website).await;

        let expected = format!("{website}menu");
        let outcome = engine
            .discover_menu(&pool, business_id, false)
            .await
            .expect("discovery completes");
        assert_eq!(
            outcome,
            MenuOutcome::Found(expected.clone()),
            "first menu-like link must win"
        );

        let row = sqlx::query("SELECT menu_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("menu row reads back");
        assert_eq!(
            row.get::<Option<String>, _>("menu_url").as_deref(),
            Some(expected.as_str()),
            "menu_url must land on the row"
        );

        // Fill-empty: a rerun with menu_url set does not re-fetch or rewrite.
        let rerun = engine
            .discover_menu(&pool, business_id, false)
            .await
            .expect("rerun completes");
        assert_eq!(
            rerun,
            MenuOutcome::NotApplicable,
            "menu_url already set -> pass is not applicable"
        );

        ac1_cleanup_business(&pool, user_id, business_id).await;
    }

    /// AC1 scenario 2: a homepage without a menu-like link leaves
    /// `menu_url` NULL and the run report says "no menu link found".
    #[tokio::test]
    async fn test_enrich_report_says_no_menu_link_found() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let stub_port = ac2_start_http_stub("/__never__", FIXTURE_NO_MENU_HOMEPAGE);
        let mut engine = ac2_test_engine(stub_port);

        let website = format!("http://127.0.0.1:{stub_port}/");
        let (user_id, business_id) =
            ac1_seed_business_with_website(&pool, &website).await;

        let report = engine.enrich(&pool, business_id, false).await;
        assert!(report.error.is_none(), "no source + no menu link is not an error");
        assert!(report.applied.is_empty());
        assert_eq!(
            report.notes,
            vec!["no menu link found".to_string()],
            "run report must say the menu link was not found"
        );

        let row = sqlx::query("SELECT menu_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("menu row reads back");
        assert!(
            row.get::<Option<String>, _>("menu_url").is_none(),
            "menu_url must stay NULL without a menu-like link"
        );

        ac1_cleanup_business(&pool, user_id, business_id).await;
    }

    /// AC1 through the full enrichment run: a menu link found on the
    /// homepage lands in the report's applied fields and on the row.
    #[tokio::test]
    async fn test_enrich_applies_menu_url_from_homepage() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let stub_port = ac2_start_http_stub("/__never__", FIXTURE_MENU_HOMEPAGE);
        let mut engine = ac2_test_engine(stub_port);

        let website = format!("http://127.0.0.1:{stub_port}/");
        let (user_id, business_id) =
            ac1_seed_business_with_website(&pool, &website).await;

        let report = engine.enrich(&pool, business_id, false).await;
        assert!(report.error.is_none());
        assert!(
            report.notes.is_empty(),
            "clean menu discovery carries no notes: {:?}",
            report.notes
        );
        let fields: Vec<&str> = report.applied.iter().map(|a| a.field).collect();
        assert_eq!(fields, vec!["menu_url"]);

        let row = sqlx::query("SELECT menu_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("menu row reads back");
        assert_eq!(
            row.get::<Option<String>, _>("menu_url").as_deref(),
            Some(format!("{website}menu").as_str())
        );

        ac1_cleanup_business(&pool, user_id, business_id).await;
    }

    /// The homepage is bot-blocked (403) but the `SearXNG` results carry
    /// a menu page on the website's own host: `menu_url` falls back to
    /// the result URL and the run still succeeds.
    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn test_enrich_menu_falls_back_to_search_results_when_homepage_blocked() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        // Routed stub: the SearXNG endpoint serves the results fixture;
        // every other request (the homepage fetch) is 403.
        let searxng_body = r#"{
            "query": "fallback fixture",
            "results": [
                {
                    "url": "https://menu-fixture.example/",
                    "title": "Fallback Kitchen",
                    "content": "Fallback kitchen.",
                    "engine": "searxng",
                    "score": 1.0
                },
                {
                    "url": "https://menu-fixture.example/menu",
                    "title": "Menu - Fallback Kitchen",
                    "content": "Dinner menu.",
                    "engine": "searxng",
                    "score": 0.9
                }
            ]
        }"#;
        let searxng_body = searxng_body.to_string();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind routed stub listener");
        let port = listener.local_addr().expect("routed stub address").port();
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
                            if head.windows(4).any(|window| window == b"\r\n\r\n") {
                                break;
                            }
                        }
                    }
                }
                let request_line = String::from_utf8_lossy(&head)
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                let (status, body) = if request_line.contains("searxng.test") {
                    ("200 OK", searxng_body.as_str())
                } else {
                    ("403 Forbidden", "")
                };
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });

        let mut engine = ac2_test_engine(port);
        let name = format!("AC2 Menu Fallback Business {}", Uuid::new_v4());
        let email = format!("ac2-menu-fb-{}@example.com", Uuid::new_v4());
        let user_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, 'test', 'AC2 Menu FB', 'admin')
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
                "INSERT INTO businesses (owner_id, name, category_id, website)
                 VALUES ($1, $2, 'test-enrichment', 'https://menu-fixture.example/')
                 RETURNING id",
            )
            .bind(user_id)
            .bind(&name)
            .fetch_one(&pool)
            .await
            .expect("seed business inserts");
            row.get::<Uuid, _>("id")
        };
        let job_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO scrape_jobs (source, query, location)
                 VALUES ('ac2-test', 'menu fallback', 'Test')
                 RETURNING id",
            )
            .fetch_one(&pool)
            .await
            .expect("seed scrape job inserts");
            row.get::<Uuid, _>("id")
        };
        sqlx::query(
            "INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id)
             VALUES ($1, 'google_maps', $2, 'http://maps.google.test/maps/place?cid=menu-fallback')",
        )
        .bind(job_id)
        .bind(&name)
        .execute(&pool)
        .await
        .expect("seed source inserts");

        let report = engine.enrich(&pool, business_id, false).await;
        assert!(
            report.error.is_none(),
            "a blocked homepage must not fail the run: {:?} {:?}",
            report.error,
            report.notes
        );
        let fields: Vec<&str> = report.applied.iter().map(|a| a.field).collect();
        assert!(
            fields.contains(&"menu_url"),
            "fallback must apply menu_url, applied: {fields:?}"
        );
        let row = sqlx::query("SELECT menu_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("menu row reads back");
        assert_eq!(
            row.get::<Option<String>, _>("menu_url").as_deref(),
            Some("https://menu-fixture.example/menu")
        );

        sqlx::query("DELETE FROM businesses WHERE id = $1")
            .bind(business_id)
            .execute(&pool)
            .await
            .expect("business cleanup");
        sqlx::query("DELETE FROM scraped_businesses WHERE scrape_job_id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("scraped cleanup");
        sqlx::query("DELETE FROM scrape_jobs WHERE id = $1")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("job cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("user cleanup");
    }

    /// Homepage fetch failure: `menu_url` stays NULL, the failure is
    /// recorded on the run report, and the run continues without error.
    #[tokio::test]
    async fn test_discover_menu_fetch_failure_leaves_row_unchanged() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let fail_port = ac2_start_http_stub("127.0.0.1", "{}");
        let mut engine = ac2_test_engine(fail_port);

        let website = format!("http://127.0.0.1:{fail_port}/");
        let (user_id, business_id) =
            ac1_seed_business_with_website(&pool, &website).await;

        let outcome = engine
            .discover_menu(&pool, business_id, false)
            .await
            .expect("fetch failure is reported, not fatal");
        assert!(
            matches!(&outcome, MenuOutcome::FetchFailed(msg) if msg.contains("HTTP 500")),
            "HTTP 500 must surface as FetchFailed, got {outcome:?}"
        );

        let row = sqlx::query("SELECT menu_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("menu row reads back");
        assert!(
            row.get::<Option<String>, _>("menu_url").is_none(),
            "menu_url must stay NULL on fetch failure"
        );

        // The full enrichment run keeps going: the failure lands in notes,
        // not in the business-level error.
        let report = engine.enrich(&pool, business_id, false).await;
        assert!(
            report.error.is_none(),
            "a failed homepage fetch must not mark the business failed"
        );
        assert!(
            report
                .notes
                .iter()
                .any(|n| n.contains("menu discovery failed")),
            "run report must record the menu fetch failure: {:?}",
            report.notes
        );

        ac1_cleanup_business(&pool, user_id, business_id).await;
    }

    /// `dry_run`: the menu write is reported as applied but zero UPDATEs
    /// hit the row.
    #[tokio::test]
    async fn test_enrich_dry_run_reports_menu_url_without_writing() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let stub_port = ac2_start_http_stub("/__never__", FIXTURE_MENU_HOMEPAGE);
        let mut engine = ac2_test_engine(stub_port);

        let website = format!("http://127.0.0.1:{stub_port}/");
        let (user_id, business_id) =
            ac1_seed_business_with_website(&pool, &website).await;

        let report = engine.enrich(&pool, business_id, true).await;
        assert!(report.error.is_none());
        let fields: Vec<&str> = report.applied.iter().map(|a| a.field).collect();
        assert_eq!(
            fields,
            vec!["menu_url"],
            "dry run must report the planned menu write"
        );

        let row = sqlx::query("SELECT menu_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("menu row reads back");
        assert!(
            row.get::<Option<String>, _>("menu_url").is_none(),
            "dry run must issue zero UPDATEs"
        );

        ac1_cleanup_business(&pool, user_id, business_id).await;
    }

    /// 500 KB body cap: an over-cap homepage is rejected before menu
    /// extraction.
    #[tokio::test]
    async fn test_fetch_homepage_rejects_body_over_500_kb() {
        let big_body = "a".repeat(500 * 1024 + 1);
        let port = ac2_start_http_stub("/__never__", &big_body);
        let mut engine = ac2_test_engine(port);

        let err = engine
            .fetch_homepage(&format!("http://127.0.0.1:{port}/"))
            .await
            .expect_err("over-cap body must be rejected");
        assert!(
            err.starts_with("homepage fetch failed"),
            "unexpected error: {err}"
        );
    }
    // =====================================================================
    // LOC-0081 AC2: photo selection with stability check
    // =====================================================================

    /// Place-JSON + photo stub: the place-JSON GET answers 200 with
    /// `place_body(port)` (application/json); any request whose target
    /// contains "/photos/" answers `photo_status` with
    /// `photo_content_type` and no body (HEAD-style).
    fn ac3_start_photo_stub(
        place_body: Box<dyn Fn(u16) -> String + Send>,
        photo_status: u16,
        photo_content_type: &str,
    ) -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind AC3 stub listener");
        let port = listener.local_addr().expect("AC3 stub address").port();
        let photo_content_type = photo_content_type.to_string();
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
                            if head.windows(4).any(|window| window == b"\r\n\r\n") {
                                break;
                            }
                        }
                    }
                }
                let request_line = String::from_utf8_lossy(&head)
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                if request_line.contains("/photos/") {
                    let response = format!(
                        "HTTP/1.1 {photo_status} Stub\r\nContent-Type: {photo_content_type}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                } else {
                    let body = place_body(port);
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
            }
        });
        port
    }

    /// Seed a user, a business (`image_url` NULL or preset), a scrape job,
    /// and a `google_maps` source row named after the business so
    /// `resolve_source` finds it. Returns (`user_id`, `business_id`, `job_id`).
    async fn ac3_seed_photo_business(pool: &PgPool, preset_image_url: Option<&str>) -> (Uuid, Uuid, Uuid) {
        let name = format!("AC3 Photo Business {}", Uuid::new_v4());
        let email = format!("ac3-photo-{}@example.com", Uuid::new_v4());
        let user_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, 'test', 'AC3 Photo', 'admin')
                 RETURNING id",
            )
            .bind(&email)
            .fetch_one(pool)
            .await
            .expect("seed user inserts");
            row.get::<Uuid, _>("id")
        };
        let business_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO businesses (owner_id, name, category_id, image_url)
                 VALUES ($1, $2, 'test-enrichment', $3)
                 RETURNING id",
            )
            .bind(user_id)
            .bind(&name)
            .bind(preset_image_url)
            .fetch_one(pool)
            .await
            .expect("seed business inserts");
            row.get::<Uuid, _>("id")
        };
        let job_id: Uuid = {
            let row = sqlx::query(
                "INSERT INTO scrape_jobs (source, query, location)
                 VALUES ('ac3-test', 'ac3 photo', 'Test')
                 RETURNING id",
            )
            .fetch_one(pool)
            .await
            .expect("seed scrape job");
            row.get::<Uuid, _>("id")
        };
        sqlx::query(
            "INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id)
             VALUES ($1, 'google_maps', $2, 'http://maps.google.test/maps/place?cid=ac3-photo')",
        )
        .bind(job_id)
        .bind(&name)
        .execute(pool)
        .await
        .expect("seed source inserts");
        (user_id, business_id, job_id)
    }

    async fn ac3_cleanup_photo_business(pool: &PgPool, user_id: Uuid, business_id: Uuid, job_id: Uuid) {
        sqlx::query("DELETE FROM businesses WHERE id = $1")
            .bind(business_id)
            .execute(pool)
            .await
            .expect("business cleanup");
        sqlx::query("DELETE FROM scraped_businesses WHERE scrape_job_id = $1")
            .bind(job_id)
            .execute(pool)
            .await
            .expect("scraped businesses cleanup");
        sqlx::query("DELETE FROM scrape_jobs WHERE id = $1")
            .bind(job_id)
            .execute(pool)
            .await
            .expect("scrape job cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(pool)
            .await
            .expect("user cleanup");
    }

    /// `PlaceData` carrying exactly the two fixture photo URLs (first must
    /// win). `SearXNG` lookups never carry photos, so the photo pass is
    /// driven with hand-built `PlaceData` values.
    fn photo_place(port: u16) -> PlaceData {
        PlaceData {
            phone: None,
            website: None,
            description: None,
            rating: None,
            review_count: None,
            social_urls: None,
            photos: Some(vec![
                format!("http://127.0.0.1:{port}/photos/first.jpg"),
                format!("http://127.0.0.1:{port}/photos/second.jpg"),
            ]),
        }
    }

    // Parse: the place JSON photos array becomes ordered photo URLs.

    #[test]
    fn test_parse_place_json_photos_array_extracts_urls_in_order() {
        let place = parse_place_json(
            r#"{"photos": [
                 {"uri": "https://lh3.googleusercontent.com/a"},
                 {"uri": "https://lh3.googleusercontent.com/b"}
               ]}"#
        )
        .expect("parses");

        let photos = place.photos.expect("photos array parsed");
        assert_eq!(photos.len(), 2, "both photos must be kept in order");
        assert_eq!(photos[0], "https://lh3.googleusercontent.com/a");
        assert_eq!(photos[1], "https://lh3.googleusercontent.com/b");
    }

    #[test]
    fn test_parse_place_json_photo_entries_accept_uri_url_and_bare_strings() {
        let place = parse_place_json(
            r#"{"photos": [
                 "https://x.example/p1.jpg",
                 {"uri": "https://x.example/p2.jpg"},
                 {"url": "https://x.example/p3.jpg"},
                 {"unrelated": true},
                 "   "
               ]}"#
        )
        .expect("parses");

        let photos = place.photos.expect("photos array parsed");
        assert_eq!(
            photos,
            vec![
                "https://x.example/p1.jpg".to_string(),
                "https://x.example/p2.jpg".to_string(),
                "https://x.example/p3.jpg".to_string(),
            ],
            "non-URL entries and blank strings are dropped, order kept"
        );
    }

    #[test]
    fn test_parse_place_json_photos_missing_or_empty_stay_none() {
        let place = parse_place_json(r#"{"phone": "+15550001111"}"#).expect("parses");
        assert!(place.photos.is_none(), "no photos key -> None");

        let place = parse_place_json(r#"{"photos": []}"#).expect("parses");
        assert!(place.photos.is_none(), "empty array -> None");
    }

    // HEAD check: the stability gate for a photo URL.

    #[tokio::test]
    async fn test_head_photo_passes_on_success_with_image_content_type() {
        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 200, "image/jpeg");
        let mut engine = ac2_test_engine(port);

        engine
            .head_photo(&format!("http://127.0.0.1:{port}/photos/p.jpg"))
            .await
            .expect("200 + image/* must pass the check");
    }

    #[tokio::test]
    async fn test_head_photo_fails_on_http_404() {
        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 404, "image/jpeg");
        let mut engine = ac2_test_engine(port);

        let err = engine
            .head_photo(&format!("http://127.0.0.1:{port}/photos/p.jpg"))
            .await
            .expect_err("404 must fail the check");
        assert!(err.contains("HTTP 404"), "unexpected error: {err}");
    }

    #[tokio::test]
    async fn test_head_photo_fails_on_non_image_content_type() {
        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 200, "text/html");
        let mut engine = ac2_test_engine(port);

        let err = engine
            .head_photo(&format!("http://127.0.0.1:{port}/photos/p.jpg"))
            .await
            .expect_err("non-image content type must fail the check");
        assert!(
            err.contains("non-image content type"),
            "unexpected error: {err}"
        );
    }

    // Photo-selection pass, driven directly against a pre-loaded row:
    // the SearXNG lookup never carries photos, so these tests exercise
    // the pass itself (row + PlaceData in, PhotoOutcome out).

    /// AC2: a place with photos and a NULL `image_url` lands the first
    /// photo URL on the row after it passes the HEAD check.
    #[tokio::test]
    async fn test_discover_photo_sets_image_url_from_first_photo() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 200, "image/jpeg");
        let mut engine = ac2_test_engine(port);

        let (user_id, business_id, job_id) = ac3_seed_photo_business(&pool, None).await;
        let row = load_business(&pool, business_id).await.expect("row loads");
        let place = photo_place(port);

        let outcome = engine
            .discover_photo_on_place(&pool, business_id, &row, &place, false)
            .await
            .expect("photo pass runs");
        let expected = format!("http://127.0.0.1:{port}/photos/first.jpg");
        assert_eq!(
            outcome,
            PhotoOutcome::Selected(expected.clone()),
            "the first photo URL must be selected"
        );

        let row = sqlx::query("SELECT image_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("photo row reads back");
        assert_eq!(
            row.get::<Option<String>, _>("image_url").as_deref(),
            Some(expected.as_str()),
            "the first photo URL must land on the row"
        );

        ac3_cleanup_photo_business(&pool, user_id, business_id, job_id).await;
    }

    /// AC2 scenario: a first photo URL that 404s on HEAD fails the check
    /// and leaves `image_url` NULL.
    #[tokio::test]
    async fn test_discover_photo_404_keeps_image_url_null() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 404, "image/jpeg");
        let mut engine = ac2_test_engine(port);

        let (user_id, business_id, job_id) = ac3_seed_photo_business(&pool, None).await;
        let row = load_business(&pool, business_id).await.expect("row loads");
        let place = photo_place(port);

        let outcome = engine
            .discover_photo_on_place(&pool, business_id, &row, &place, false)
            .await
            .expect("photo pass runs");
        assert!(
            matches!(&outcome, PhotoOutcome::CheckFailed(detail) if detail.contains("HTTP 404")),
            "404 must fail the check: {outcome:?}"
        );

        let row = sqlx::query("SELECT image_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("photo row reads back");
        assert!(
            row.get::<Option<String>, _>("image_url").is_none(),
            "image_url must stay NULL on a failed check"
        );

        ac3_cleanup_photo_business(&pool, user_id, business_id, job_id).await;
    }

    /// AC2 scenario: a first photo URL whose HEAD returns a non-image
    /// content type fails the check and leaves `image_url` NULL.
    #[tokio::test]
    async fn test_discover_photo_non_image_content_type_keeps_image_url_null() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 200, "text/html");
        let mut engine = ac2_test_engine(port);

        let (user_id, business_id, job_id) = ac3_seed_photo_business(&pool, None).await;
        let row = load_business(&pool, business_id).await.expect("row loads");
        let place = photo_place(port);

        let outcome = engine
            .discover_photo_on_place(&pool, business_id, &row, &place, false)
            .await
            .expect("photo pass runs");
        assert!(
            matches!(&outcome, PhotoOutcome::CheckFailed(detail) if detail.contains("non-image content type")),
            "non-image content type must fail the check: {outcome:?}"
        );

        let row = sqlx::query("SELECT image_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("photo row reads back");
        assert!(
            row.get::<Option<String>, _>("image_url").is_none(),
            "image_url must stay NULL for a non-image content type"
        );

        ac3_cleanup_photo_business(&pool, user_id, business_id, job_id).await;
    }

    /// `dry_run`: the photo write is reported as selected but zero UPDATEs
    /// hit the row.
    #[tokio::test]
    async fn test_discover_photo_dry_run_reports_without_writing() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 200, "image/jpeg");
        let mut engine = ac2_test_engine(port);

        let (user_id, business_id, job_id) = ac3_seed_photo_business(&pool, None).await;
        let row = load_business(&pool, business_id).await.expect("row loads");
        let place = photo_place(port);

        let outcome = engine
            .discover_photo_on_place(&pool, business_id, &row, &place, true)
            .await
            .expect("photo pass runs");
        let expected = format!("http://127.0.0.1:{port}/photos/first.jpg");
        assert_eq!(
            outcome,
            PhotoOutcome::Selected(expected),
            "dry run must report the planned photo write"
        );

        let row = sqlx::query("SELECT image_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("photo row reads back");
        assert!(
            row.get::<Option<String>, _>("image_url").is_none(),
            "dry run must issue zero UPDATEs"
        );

        ac3_cleanup_photo_business(&pool, user_id, business_id, job_id).await;
    }

    /// Fill-empty: a preset `image_url` is never overwritten — the pass is
    /// not even applicable (no HEAD request).
    #[tokio::test]
    async fn test_discover_photo_not_applicable_when_image_url_set() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        // 404 photos: if the pass ran the check, it would report CheckFailed.
        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 404, "image/jpeg");
        let mut engine = ac2_test_engine(port);

        let preset = "https://example.com/preset.jpg";
        let (user_id, business_id, job_id) = ac3_seed_photo_business(&pool, Some(preset)).await;
        let row = load_business(&pool, business_id).await.expect("row loads");
        let place = photo_place(port);

        let outcome = engine
            .discover_photo_on_place(&pool, business_id, &row, &place, false)
            .await
            .expect("photo pass runs");
        assert_eq!(
            outcome,
            PhotoOutcome::NotApplicable,
            "pass must not run when image_url is set: {outcome:?}"
        );

        let row = sqlx::query("SELECT image_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("photo row reads back");
        assert_eq!(
            row.get::<Option<String>, _>("image_url").as_deref(),
            Some(preset),
            "preset image_url must survive the run"
        );

        ac3_cleanup_photo_business(&pool, user_id, business_id, job_id).await;
    }

    /// No photos in the place: the pass is not applicable.
    #[tokio::test]
    async fn test_discover_photo_not_applicable_when_place_has_no_photos() {
        let pool = match test_pool().await {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("SKIP db test (compose Postgres unavailable): {e}");
                return;
            }
        };

        let port = ac3_start_photo_stub(Box::new(|_| String::new()), 200, "image/jpeg");
        let mut engine = ac2_test_engine(port);

        let (user_id, business_id, job_id) = ac3_seed_photo_business(&pool, None).await;
        let row = load_business(&pool, business_id).await.expect("row loads");
        let place = PlaceData {
            photos: None,
            ..PlaceData::default()
        };

        let outcome = engine
            .discover_photo_on_place(&pool, business_id, &row, &place, false)
            .await
            .expect("photo pass runs");
        assert_eq!(
            outcome,
            PhotoOutcome::NotApplicable,
            "no photos -> pass is not applicable: {outcome:?}"
        );

        let row = sqlx::query("SELECT image_url FROM businesses WHERE id = $1")
            .bind(business_id)
            .fetch_one(&pool)
            .await
            .expect("photo row reads back");
        assert!(row.get::<Option<String>, _>("image_url").is_none());

        ac3_cleanup_photo_business(&pool, user_id, business_id, job_id).await;
    }
}
