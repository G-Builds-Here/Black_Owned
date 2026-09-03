//! Automated location discovery for multi-location businesses.
//!
//! Mines a business's enrichment `SearXNG` results for secondary physical
//! locations: US street addresses extracted from the snippets of results
//! whose titles contain the full business name, labels pulled from venue
//! titles (`OpenTable` "West Midtown", Tripadvisor "Howell Mill"),
//! coordinates via Nominatim, and rows written to `business_locations`
//! with `is_primary = false`.
//!
//! Compliance: Nominatim is the same sanctioned geocoder used by
//! `npm run geocode`; its usage policy (descriptive `User-Agent`, at most
//! 1 request/second) is met by the fixed UA in [`Geocoder`] and by
//! routing every call through the engine's shared rate limiter (>= 2s
//! spacing). Google share links are never fetched; discovery only reads
//! `SearXNG` result metadata (titles + snippets).

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::searxng::SearxngResult;

/// Default Nominatim endpoint; override with `NOMINATIM_URL` (e.g. a local
/// mirror for tests or air-gapped setups).
pub const DEFAULT_NOMINATIM_URL: &str = "https://nominatim.openstreetmap.org";

/// Maximum new secondary locations written for one business per run.
pub const MAX_LOCATIONS_PER_BUSINESS: usize = 5;

/// Maximum candidate addresses geocoded per business per run (bounds
/// Nominatim load when a snippet carries many addresses).
pub const MAX_CANDIDATES_TO_GEOCODE: usize = 8;

/// Candidates geocoding within this distance (meters) are the same place —
/// merged so near-duplicate addresses (OCR typos such as "Ml" vs "Mill")
/// do not produce duplicate pins.
pub const MERGE_DISTANCE_M: f64 = 300.0;

/// Venue-title fragments that name a platform or page kind, not a branch.
/// A candidate label is rejected when it equals or starts with one of these
/// (case-insensitive), e.g. "… - Restaurant Reviews - Yelp".
const TITLE_LABEL_STOPWORDS: &[&str] = &[
    "restaurant",
    "restaurants",
    "reviews",
    "review",
    "menu",
    "menus",
    "delivery",
    "order",
    "ordering",
    "online",
    "best",
    "food",
    "foods",
    "dining",
    "bar",
    "bistro",
    "cafe",
    "coffee",
    "bakery",
    "pub",
    "grill",
    "kitchen",
    "catering",
    "official",
    "website",
    "homepage",
    "home",
    "opentable",
    "yelp",
    "tripadvisor",
    "ubereats",
    "uber eats",
    "doordash",
    "postmates",
    "google",
    "maps",
    "map",
    "directions",
    "instagram",
    "facebook",
    "twitter",
    "tiktok",
    "youtube",
];

/// One discovered secondary location (or a dry-run candidate).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LocationDiscovered {
    /// Branch label from venue titles, or the city when no label votes.
    pub label: Option<String>,
    pub address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lng: Option<f64>,
    /// True when a new `business_locations` row was actually inserted
    /// (false on dry runs and on deduped repeats).
    pub inserted: bool,
}

/// Outcome of a location-discovery pass for one business.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct LocationDiscoveryOutcome {
    pub business_name: String,
    /// Discovered locations (inserted or would-be, in `SearXNG` rank order).
    pub locations: Vec<LocationDiscovered>,
    /// True when the primary `business_locations` row was missing and was
    /// created from the `businesses` row.
    pub primary_added: bool,
    /// Informational notes (geocode failures, dedupes, empty lookups).
    pub notes: Vec<String>,
    /// Set when the business was skipped (e.g. no `google_maps` source).
    pub reason: Option<String>,
}

/// A US street address fully matched in text (number, street, optional
/// suite, city, state, zip).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedAddress {
    /// The matched text as it appeared.
    pub full: String,
    /// House number (optionally with letter suffix, "4454", "12A").
    pub num: String,
    /// Street words lowercased (without number and suffix), "howell mill".
    pub street: String,
    /// City as written (may be empty when the snippet omitted it).
    pub city: String,
    /// Two-letter state, uppercased.
    pub state: String,
}

/// A candidate secondary location before geocoding: one distinct address
/// plus the title-label votes that plausibly name it.
#[derive(Debug, Clone)]
pub struct Candidate {
    pub parsed: ParsedAddress,
    /// Raw address variants as they appeared in snippets.
    pub address_variants: Vec<String>,
    /// Title-label votes in `SearXNG` result order.
    pub labels: Vec<String>,
}

/// US street-address regex. Requires the `, State ZIP` tail so partial
/// addresses ("1016 Howell Mill Rd Nw in Atlanta") never match.
fn us_address_re() -> &'static Regex {
    static RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
            r"(?i)\b(?P<num>\d{1,5}[A-Za-z]?)\s+(?P<street>[A-Za-z][A-Za-z0-9.'\-]*(?:\s+[A-Za-z][A-Za-z0-9.'\-]*){0,4}?)\s+(?P<suffix>St|Street|Rd|Road|Ave|Avenue|Blvd|Boul|Dr|Drive|Way|Lane|Ln|Ct|Court|Pkwy|Pk|Hwy|Highway|Cir|Circle|Loop|Terr|Ter|Trl|Trail|Pl|Place)\b\.?(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?(?:\s*,?\s+(?P<unit>Ste|Suite|Unit|Bldg|Bld|Apt|Rm|Room|Ofc|Fl|Floor)\.?\s*[\w\-]{1,12})?(?:\s*,\s*(?P<city>[A-Za-z][A-Za-z.'\-\s]{0,39}?))?\s*,\s*(?P<state>[A-Za-z]{2})\s+(?P<zip>\d{5}(?:-\d{4})?)\b",
        )
        .expect("us address regex compiles")
    });
    &RE
}

/// Lowercase, strip everything non-alphanumeric — the dedupe key for
/// addresses (also the shape of the Postgres `NOT EXISTS` predicate).
#[must_use]
pub fn normalize_addr(s: &str) -> String {
    s.to_lowercase().chars().filter(char::is_ascii_alphanumeric).collect()
}

/// Extract all fully-matched US addresses from free text, deduped in
/// first-seen order.
#[must_use]
pub fn extract_addresses(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for m in us_address_re().find_iter(text) {
        let addr = m.as_str().trim().to_string();
        if !out.contains(&addr) {
            out.push(addr);
        }
    }
    out
}

/// Parse a fully-matched address into its components.
///
/// Returns `None` when the string does not fully match the address shape.
#[must_use]
pub fn parse_address(full: &str) -> Option<ParsedAddress> {
    let caps = us_address_re().captures(full)?;
    Some(ParsedAddress {
        full: full.trim().to_string(),
        num: caps["num"].trim().to_string(),
        street: caps["street"].trim().to_lowercase(),
        city: caps
            .name("city")
            .map(|c| c.as_str().trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_default(),
        state: caps["state"].trim().to_uppercase(),
    })
}

fn normalize_offsets(s: &str) -> (String, Vec<usize>) {
    let mut norm = String::new();
    let mut offsets = Vec::new();
    for (i, c) in s.char_indices() {
        if c.is_ascii_alphanumeric() {
            offsets.push(i);
            norm.push(c.to_ascii_lowercase());
        }
    }
    (norm, offsets)
}

/// True when `title` mentions the full business name (case- and
/// punctuation-insensitive), e.g. "ZEKE'S KITCHEN & BAR - …" matches
/// "Zeke's Kitchen & Bar".
#[must_use]
pub fn title_has_full_name(title: &str, business_name: &str) -> bool {
    let (name_norm, _) = normalize_offsets(business_name);
    if name_norm.is_empty() {
        return false;
    }
    let (title_norm, _) = normalize_offsets(title);
    title_norm.contains(&name_norm)
}

/// Extract a branch label from a venue title: the text after the business
/// name, cut at the first structural separator (`,` `|` `(` ` - ` ` – `
/// ` · `), validated against a length/charset/stopword allowlist.
///
/// "… - West Midtown, Atlanta, GA - `OpenTable`" -> Some("West Midtown")
/// "… - Restaurant Reviews - Yelp" -> None (stopword)
/// "Zeke's Kitchen & Bar" -> None (nothing after the name)
#[must_use]
pub fn extract_title_label(title: &str, business_name: &str) -> Option<String> {
    let (name_norm, _) = normalize_offsets(business_name);
    if name_norm.is_empty() {
        return None;
    }
    let (title_norm, title_offsets) = normalize_offsets(title);
    let pos = title_norm.find(&name_norm)?;
    let name_end = pos + name_norm.len();
    let title_pos = *title_offsets.get(name_end - 1)?;
    let rest = &title[title_pos + 1..];

    let stripped = rest.trim_start_matches(|c: char| {
        c.is_whitespace() || matches!(c, '-' | '–' | '—' | ',' | '|' | '·' | '(')
    });
    let cut = [
        stripped.find(','),
        stripped.find('|'),
        stripped.find('('),
        stripped.find(" - "),
        stripped.find(" – "),
        stripped.find(" · "),
    ]
    .into_iter()
    .flatten()
    .min()
    .unwrap_or(stripped.len());
    let label = stripped[..cut].trim().to_string();

    if !(2..=40).contains(&label.len()) {
        return None;
    }
    if label
        .chars()
        .any(|c| !c.is_alphanumeric() && c != '&' && c != '\'' && c != '-' && !c.is_whitespace())
    {
        return None;
    }
    let lower = label.to_lowercase();
    if TITLE_LABEL_STOPWORDS.iter().any(|w| lower == *w || lower.starts_with(w)) {
        return None;
    }
    Some(title_case(&label))
}

/// Title-case a label ("HOWELL MILL" -> "Howell Mill").
#[must_use]
fn title_case(s: &str) -> String {
    s.split_whitespace()
        .map(|w| {
            let lower = w.to_lowercase();
            let mut chars = lower.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().to_string() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Street key for primary-address exclusion: the house number plus the
/// first two street words (multi-char tokens only), lowercased.
fn street_key_tokens(addr: &str) -> Vec<String> {
    let tokens: Vec<String> = addr
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_lowercase)
        .collect();
    let mut key = Vec::new();
    if let Some(num) = tokens.first() {
        key.push(num.clone());
    }
    for token in tokens.iter().skip(1).take(2) {
        key.push(token.clone());
    }
    key.into_iter().filter(|t| t.chars().count() > 1).collect()
}

/// True when the candidate is the primary address itself (same house
/// number + street words), i.e. not a secondary location.
#[must_use]
pub fn is_primary_address(candidate: &str, primary_location: &Option<String>) -> bool {
    let Some(primary) = primary_location else {
        return false;
    };
    let primary_norm = normalize_addr(primary);
    if primary_norm.is_empty() {
        return false;
    }
    let key = street_key_tokens(candidate);
    !key.is_empty() && key.iter().all(|k| primary_norm.contains(k.as_str()))
}

/// Build candidates from `SearXNG` results: mine US addresses from the
/// snippets of results whose titles carry the full business name, and
/// attach title labels that plausibly name each candidate (snippet
/// mentions the address, or the venue title carries the candidate's city).
#[must_use]
pub fn build_candidates(business_name: &str, results: &[SearxngResult]) -> Vec<Candidate> {
    let mut out: Vec<Candidate> = Vec::new();
    for result in results {
        if !title_has_full_name(&result.title, business_name) {
            continue;
        }
        let label = extract_title_label(&result.title, business_name);
        let content = result.content.clone().unwrap_or_default();
        let content_lower = content.to_lowercase();
        let title_lower = result.title.to_lowercase();

        for addr in extract_addresses(&content) {
            let Some(parsed) = parse_address(&addr) else {
                continue;
            };
            let norm = normalize_addr(&addr);
            if let Some(existing) = out.iter_mut().find(|c| normalize_addr(&c.parsed.full) == norm) {
                existing.address_variants.push(addr.clone());
                if let Some(l) = &label {
                    existing.labels.push(l.clone());
                }
            } else {
                out.push(Candidate {
                    parsed,
                    address_variants: vec![addr],
                    labels: label.clone().into_iter().collect(),
                });
            }
        }

        if let Some(l) = &label {
            for c in &mut out {
                if c.labels.iter().any(|v| v == l) {
                    continue;
                }
                let mentioned_in_snippet =
                    !content_lower.is_empty() && content_lower.contains(&c.parsed.full.to_lowercase());
                let city_in_title = !c.parsed.city.is_empty() && title_lower.contains(&c.parsed.city.to_lowercase());
                if mentioned_in_snippet || city_in_title {
                    c.labels.push(l.clone());
                }
            }
        }
    }
    out
}

/// Drop candidates that are the primary address or out-of-state relative
/// to the primary location. Order is preserved.
#[must_use]
pub fn filter_candidates(candidates: &[Candidate], primary_location: &Option<String>) -> Vec<Candidate> {
    let primary_state = primary_location
        .as_deref()
        .and_then(parse_address)
        .map(|p| p.state);
    candidates
        .iter()
        .filter(|c| {
            let state_ok = primary_state
                .as_deref()
                .is_none_or(|ps| ps == c.parsed.state.as_str());
            state_ok && !is_primary_address(&c.parsed.full, primary_location)
        })
        .cloned()
        .collect()
}

/// Pick the label for a merged candidate: most-frequent title-label vote,
/// first-seen (`SearXNG` rank order) wins ties; the city when no votes.
#[must_use]
pub fn pick_label(labels: &[String], fallback_city: &str) -> Option<String> {
    let mut counts: HashMap<&str, (usize, usize)> = HashMap::new();
    for (i, l) in labels.iter().enumerate() {
        let entry = counts.entry(l.as_str()).or_insert((0, i));
        entry.0 += 1;
    }
    if counts.is_empty() {
        return (!fallback_city.is_empty()).then(|| fallback_city.to_string());
    }
    counts
        .into_iter()
        .max_by(|a, b| a.1 .0.cmp(&b.1 .0).then(b.1 .1.cmp(&a.1 .1)))
        .map_or_else(
            || (!fallback_city.is_empty()).then(|| fallback_city.to_string()),
            |(label, _)| Some(title_case(label)),
        )
}

/// Great-circle distance in meters (haversine).
///
/// Geodesic distance is inherently floating-point; the pedantic float
/// lint is intentionally off here.
#[must_use]
#[allow(clippy::float_arithmetic)]
pub fn distance_m(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    const R_M: f64 = 6_371_000.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlng = (lng2 - lng1).to_radians();
    let a = dlat.sin().powi(2) + lat1.to_radians().cos() * lat2.to_radians().cos() * dlng.sin().powi(2);
    2.0 * R_M * a.sqrt().asin()
}

/// Nominatim geocoding client (search endpoint, `format=json`).
///
/// Compliance is the fixed [`Geocoder::UA`] plus the caller's rate
/// limiting (the engine's shared limiter spaces requests >= 2s apart,
/// above Nominatim's 1 request/second policy).
pub struct Geocoder {
    client: reqwest::Client,
    base: String,
}

impl Geocoder {
    /// Descriptive UA per Nominatim's usage policy.
    const UA: &'static str = "BlackOwnedDirectory/1.0 (location discovery; geocoding only)";

    /// Wrap an existing HTTP client with the endpoint at `base`.
    #[must_use]
    pub fn new(client: &reqwest::Client, base: &str) -> Self {
        Self {
            client: client.clone(),
            base: base.trim_end_matches('/').to_string(),
        }
    }

    /// Geocode a full US address. `Ok(None)` means Nominatim found no
    /// match; an `Err` means the request or its payload failed.
    ///
    /// # Errors
    ///
    /// Returns an error on transport failure, non-2xx status, or a body
    /// that is not a JSON array of place objects.
    pub async fn geocode(&self, address: &str) -> Result<Option<(f64, f64)>, String> {
        let url = format!("{}/search", self.base);
        let response = self
            .client
            .get(&url)
            .header("User-Agent", Self::UA)
            .header("Accept", "application/json")
            .query(&[
                ("format", "json"),
                ("limit", "1"),
                ("addressdetails", "0"),
                ("q", address),
            ])
            .send()
            .await
            .map_err(|e| format!("geocode request failed: {e}"))?;
        let status = response.status();
        let body: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("geocode response parse failed: {e}"))?;
        if !status.is_success() {
            return Err(format!("geocode request failed: HTTP {}", status.as_u16()));
        }
        let first = body.into_iter().next().unwrap_or(serde_json::Value::Null);
        let (Some(lat), Some(lon)) = (
            first.get("lat").and_then(|v| v.as_str()),
            first.get("lon").and_then(|v| v.as_str()),
        ) else {
            return Ok(None);
        };
        let lat: f64 = lat.parse().map_err(|e| format!("geocode lat parse failed: {e}"))?;
        let lng: f64 = lon.parse().map_err(|e| format!("geocode lon parse failed: {e}"))?;
        Ok(Some((lat, lng)))
    }
}

/// Insert a secondary location row, skipping when an address that
/// normalizes (lowercased, alphanumeric-only) to the same text already
/// exists for the business. No unique constraint exists on the table, so
/// dedupe is done in Rust: each stored address is normalized with `normalize_addr`
///
/// # Errors
///
/// Returns an error when the query fails.
pub async fn insert_secondary_location(
    pool: &PgPool,
    business_id: Uuid,
    label: &Option<String>,
    address: &str,
    lat: Option<f64>,
    lng: Option<f64>,
) -> Result<bool, String> {
    let normalized = normalize_addr(address);
    let existing: Vec<String> = sqlx::query_scalar(
        "SELECT address FROM business_locations WHERE business_id = $1",
    )
    .bind(business_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    if existing.iter().any(|a| normalize_addr(a) == normalized) {
        return Ok(false);
    }
    let result = sqlx::query(
        "INSERT INTO business_locations (business_id, label, address, lat, lng, is_primary)
         VALUES ($1, $2, $3, $4, $5, false)",
    )
    .bind(business_id)
    .bind(label)
    .bind(address)
    .bind(lat)
    .bind(lng)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.rows_affected() > 0)
}

/// Ensure the business has a primary `business_locations` row, creating it
/// from the `businesses` row (`location`/`lat`/`lng`) when missing.
///
/// # Errors
///
/// Returns an error when the query fails.
pub async fn ensure_primary_location(pool: &PgPool, business_id: Uuid) -> Result<bool, String> {
    let result = sqlx::query(
        "INSERT INTO business_locations (business_id, label, address, lat, lng, is_primary)
         SELECT b.id, NULL, b.location, b.lat, b.lng, true
         FROM businesses b
         WHERE b.id = $1
           AND b.location IS NOT NULL
           AND trim(b.location) <> ''
           AND NOT EXISTS (
               SELECT 1 FROM business_locations bl
               WHERE bl.business_id = b.id AND bl.is_primary = true
           )",
    )
    .bind(business_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(title: &str, content: &str) -> SearxngResult {
        SearxngResult {
            url: "https://example.test/x".into(),
            title: title.into(),
            content: Some(content.into()),
            engine: None,
            engines: vec![],
            score: None,
            img_src: None,
        }
    }

    #[test]
    fn extract_title_label_open_table_venue_title() {
        assert_eq!(
            extract_title_label(
                "Zeke's Kitchen & Bar - West Midtown, Atlanta, GA - OpenTable",
                "Zeke's Kitchen & Bar"
            )
            .as_deref(),
            Some("West Midtown")
        );
    }

    #[test]
    fn extract_title_label_uppercase_branch_title_cased() {
        assert_eq!(
            extract_title_label(
                "ZEKE'S KITCHEN & BAR - HOWELL MILL, Atlanta - Tripadvisor",
                "Zeke's Kitchen & Bar"
            )
            .as_deref(),
            Some("Howell Mill")
        );
    }

    #[test]
    fn extract_title_label_rejects_venue_stopword() {
        assert_eq!(
            extract_title_label("Zeke's Kitchen & Bar - Restaurant Reviews - Yelp", "Zeke's Kitchen & Bar"),
            None
        );
    }

    #[test]
    fn extract_title_label_none_when_nothing_after_name() {
        assert_eq!(
            extract_title_label("Zeke's Kitchen & Bar", "Zeke's Kitchen & Bar"),
            None
        );
        assert_eq!(
            extract_title_label("Order Zeke's Kitchen & Bar - Atlanta, GA Menu Delivery", "Zeke's Kitchen & Bar")
                .as_deref(),
            Some("Atlanta")
        );
    }

    #[test]
    fn extract_title_label_rejects_bad_charset_and_long_labels() {
        assert_eq!(
            extract_title_label("Zeke's Kitchen & Bar - @handle · West", "Zeke's Kitchen & Bar"),
            None
        );
        let long = format!("Zeke's Kitchen & Bar - {}", "branch name".repeat(6));
        assert_eq!(extract_title_label(&long, "Zeke's Kitchen & Bar"), None);
    }

    #[test]
    fn extract_addresses_instagram_snippet_two_addresses_truncated_second() {
        let content = "Haitian-American Fusion Rum Bar 1016 Howell Mill Rd, Ste A, Atlanta, GA 30318 4454 S Cobb Dr SE, Ste 101, Smyrn";
        assert_eq!(
            extract_addresses(content),
            vec!["1016 Howell Mill Rd, Ste A, Atlanta, GA 30318"]
        );
    }

    #[test]
    fn extract_addresses_yelp_typo_variant_matches() {
        let content = "ZEKE'S KITCHEN & BAR - Try Our New Menu - 1016 Howell Ml Rd, Ste A, Atlanta, GA 30318";
        assert_eq!(
            extract_addresses(content),
            vec!["1016 Howell Ml Rd, Ste A, Atlanta, GA 30318"]
        );
    }

    #[test]
    fn extract_addresses_primary_shape_parses() {
        let parsed = parse_address("4454 S Cobb Dr SE Ste. 101, Smyrna, GA 30080").expect("primary parses");
        assert_eq!(parsed.num, "4454");
        assert_eq!(parsed.street, "s cobb");
        assert_eq!(parsed.city, "Smyrna");
        assert_eq!(parsed.state, "GA");
    }

    #[test]
    fn extract_addresses_rejects_incomplete_and_absent() {
        assert!(extract_addresses("at 1016 Howell Mill Rd Nw in Atlanta. Order online").is_empty());
        assert!(extract_addresses("no street address in this text").is_empty());
        assert!(parse_address("4454 S Cobb Dr SE Ste. 101, Smyrn").is_none());
    }

    #[test]
    fn is_primary_address_distinguishes_primary_and_secondary() {
        let primary = Some("4454 S Cobb Dr SE Ste. 101, Smyrna, GA 30080".to_string());
        assert!(is_primary_address("4454 S Cobb Dr SE, Ste 101, Smyrna, GA 30080", &primary));
        assert!(!is_primary_address("1016 Howell Mill Rd, Ste A, Atlanta, GA 30318", &primary));
        assert!(!is_primary_address("1016 Howell Mill Rd, Ste A, Atlanta, GA 30318", &None));
    }

    #[test]
    fn build_candidates_zekes_live_fixture() {
        let results = vec![
            result(
                "Zeke's Kitchen & Bar - Restaurant Reviews - Yelp",
                "ZEKE'S KITCHEN & BAR - Try Our New Menu - 1016 Howell Ml Rd, Ste A, Atlanta, GA 30318",
            ),
            result(
                "Zeke's Kitchen & Bar (@zekeskitchenandbar) · Smyrna, GA - Instagram",
                "Haitian-American Fusion Rum Bar 1016 Howell Mill Rd, Ste A, Atlanta, GA 30318 4454 S Cobb Dr SE, Ste 101, Smyrna",
            ),
            result(
                "Zeke's Kitchen & Bar - West Midtown, Atlanta, GA - OpenTable",
                "About this restaurant. Zeke's Kitchen & Bar is locally owned",
            ),
            result(
                "ZEKE'S KITCHEN & BAR - HOWELL MILL, Atlanta - Tripadvisor",
                "Oct 20, 2025 Great little place",
            ),
            result(
                "Zeke's puts an incredible twist on traditional Haitian food. - Atlanta",
                "Feb 24, 2026 Zeke's Kitchen + Bar's West Midtown location is much bigger",
            ),
        ];
        let primary = Some("4454 S Cobb Dr SE Ste. 101, Smyrna, GA 30080".to_string());
        let candidates = filter_candidates(&build_candidates("Zeke's Kitchen & Bar", &results), &primary);

        // The primary address (Smyrna) is excluded; the West Midtown address
        // survives as two raw variants (Yelp "Ml" typo + Instagram "Mill").
        assert_eq!(candidates.len(), 2, "unexpected candidates: {candidates:?}");
        assert_eq!(candidates[0].parsed.state, "GA");
        assert_eq!(candidates[0].parsed.city, "Atlanta");

        // Label votes: OpenTable "West Midtown" (city in title) outranks /
        // ties Tripadvisor "Howell Mill" and wins by SearXNG rank order.
        assert_eq!(
            pick_label(&candidates[0].labels, "Atlanta").as_deref(),
            Some("West Midtown"),
            "votes: {:?}",
            candidates[0].labels
        );
        assert!(candidates[0].labels.iter().any(|l| l == "Howell Mill"));
    }

    #[test]
    fn filter_candidates_rejects_out_of_state() {
        let results = vec![result(
            "Zeke's Kitchen & Bar - West Midtown, Chicago, IL - OpenTable",
            "Zeke's Kitchen & Bar 1016 Howell Mill Rd, Ste A, Chicago, IL 60601",
        )];
        let primary = Some("4454 S Cobb Dr SE Ste. 101, Smyrna, GA 30080".to_string());
        let candidates = filter_candidates(&build_candidates("Zeke's Kitchen & Bar", &results), &primary);
        assert!(candidates.is_empty(), "out-of-state candidate must be rejected: {candidates:?}");
    }

    #[test]
    fn filter_candidates_keeps_all_when_primary_unparseable() {
        let results = vec![result(
            "Zeke's Kitchen & Bar - West Midtown, Atlanta, GA - OpenTable",
            "Zeke's Kitchen & Bar 1016 Howell Mill Rd, Ste A, Atlanta, GA 30318",
        )];
        let candidates = filter_candidates(&build_candidates("Zeke's Kitchen & Bar", &results), &None);
        assert_eq!(candidates.len(), 1);
    }

    #[test]
    fn pick_label_most_frequent_then_first_seen_then_city_fallback() {
        assert_eq!(
            pick_label(&["Howell Mill".into(), "West Midtown".into(), "West Midtown".into()], "Atlanta").as_deref(),
            Some("West Midtown")
        );
        assert_eq!(pick_label(&[], "Atlanta").as_deref(), Some("Atlanta"));
        assert_eq!(pick_label(&[], ""), None);
    }

    #[test]
    fn distance_m_orders_of_magnitude() {
        let near = distance_m(33.782_548, -84.411_627, 33.782_648, -84.411_727);
        assert!(near < 100.0, "near-identical coords must merge: {near}");
        let far = distance_m(33.846_956, -84.505_185, 33.782_548, -84.411_627);
        assert!(far > 5_000.0, "Smyrna to West Midtown is ~11km: {far}");
    }

    #[test]
    fn normalize_addr_strips_punctuation_and_case() {
        assert_eq!(
            normalize_addr("1016 Howell Mill Rd, Ste A, Atlanta, GA 30318"),
            "1016howellmillrdsteaatlantaga30318"
        );
        assert_eq!(
            normalize_addr("1016 HOWELL MILL RD Ste A Atlanta GA 30318"),
            "1016howellmillrdsteaatlantaga30318"
        );
    }
}
