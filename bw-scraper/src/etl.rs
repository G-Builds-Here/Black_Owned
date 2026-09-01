//! Snippet-level extraction: turn raw `SearXNG` web hits into business
//! records, rejecting directory/listicle pages.

use std::sync::LazyLock;
use std::sync::OnceLock;

use regex::Regex;

use crate::models::ScrapedBusinessRecord;
use crate::searxng::SearxngResult;

/// Deterministic, snippet-only transformation from a search result to a
/// business record. No page fetching in v1.
#[derive(Debug, Clone)]
pub struct EtlPipeline;

impl EtlPipeline {
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// Return a record when the result looks like a single business, else
    /// `None` (directory pages, listicles, and unparseable titles).
    pub fn transform(&self, result: &SearxngResult) -> Option<ScrapedBusinessRecord> {
        let name = clean_business_name(&result.title)?;
        if is_directory_like(&name) {
            return None;
        }
        let phone = result
            .content
            .as_deref()
            .and_then(extract_us_phone);
        let coords = extract_google_maps_coords(&result.url);
        Some(ScrapedBusinessRecord {
            name,
            address: None,
            phone,
            website: result.url.clone(),
            category: None,
            rating: None,
            review_count: None,
            lat: coords.map(|c| c.0),
            lng: coords.map(|c| c.1),
            source_id: stable_source_id(&result.url),
        })
    }
}

impl Default for EtlPipeline {
    fn default() -> Self {
        Self::new()
    }
}

/// Strip site suffixes ("Name | Brand", "Name - Brand") and require a
/// plausible business-name length (3..=200 chars).
fn clean_business_name(title: &str) -> Option<String> {
    let name = if let Some(pos) = title.find(" | ") {
        &title[..pos]
    } else if let Some(pos) = title.find(" - ") {
        &title[..pos]
    } else {
        title
    };
    let name = name.trim();
    let len = name.chars().count();
    if !(3..=200).contains(&len) {
        return None;
    }
    Some(name.to_string())
}

/// Words that make a title directory-like on their own.
const ALWAYS_DIRECTORY: &[&str] = &["directory", "listicle"];

/// Collection words that only make a title directory-like when a count is
/// present ("50 outstanding restaurants", "top 10 ...").
const WITH_COUNT: &[&str] = &[
    "top ",
    "best ",
    "list of",
    "guide to",
    "outstanding",
    "must-visit",
    "definitive",
    "favorite",
];

/// Heuristic: does this title advertise a collection instead of one
/// business?
fn is_directory_like(name: &str) -> bool {
    let lower = name.to_lowercase();
    let has_digit = lower.chars().any(|c| c.is_ascii_digit());
    let starts_with_digit = lower
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_digit());
    starts_with_digit
        || ALWAYS_DIRECTORY.iter().any(|w| lower.contains(w))
        || has_digit && WITH_COUNT.iter().any(|w| lower.contains(w))
}

fn phone_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b")
            .expect("valid phone regex")
    })
}

/// First US-style phone number found in the snippet, if any.
pub(crate) fn extract_us_phone(snippet: &str) -> Option<String> {
    phone_regex().find(snippet).map(|m| m.as_str().to_string())
}

/// Google Maps place URLs embed coordinates in their data fragment:
/// `...!3d<lat>!4d<lng>...`.
static MAPS_URL_COORDS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new("!3d(-?\\d+(?:\\.\\d+)?)!4d(-?\\d+(?:\\.\\d+)?)").unwrap()
});

/// Extract (lat, lng) when the result URL is a Google Maps place URL, else None.
fn extract_google_maps_coords(url: &str) -> Option<(f64, f64)> {
    let caps = MAPS_URL_COORDS.captures(url)?;
    let lat = caps.get(1)?.as_str().parse().ok()?;
    let lng = caps.get(2)?.as_str().parse().ok()?;
    Some((lat, lng))
}

/// Stable, deterministic id so re-scrapes can dedupe by `source_id`.
/// FNV-1a 64 (std's `DefaultHasher` is per-process seeded and not stable).
fn stable_source_id(url: &str) -> String {
    format!("searxng-{:x}", fnv1a64(url))
}

fn fnv1a64(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in input.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(url: &str, title: &str, content: Option<&str>) -> SearxngResult {
        SearxngResult {
            url: url.to_string(),
            title: title.to_string(),
            content: content.map(std::string::ToString::to_string),
            engine: None,
            engines: vec![],
            score: None,
            img_src: None,
        }
    }

    #[test]
    fn extracts_business_from_clean_title() {
        let record = EtlPipeline::new()
            .transform(&result(
                "https://example-eats.com/",
                "Example Eats | Our Restaurant",
                Some("Visit us at 12 Peachtree Ln. Call (404) 555-0123 today."),
            ))
            .expect("business-like result should transform");
        assert_eq!(record.name, "Example Eats");
        assert_eq!(record.website, "https://example-eats.com/");
        assert_eq!(record.phone.as_deref(), Some("(404) 555-0123"));
        assert!(record.address.is_none());
        assert!(record.category.is_none());
        assert!(record.rating.is_none());
        assert!(record.review_count.is_none());
        assert!(record.source_id.starts_with("searxng-"));
    }

    #[test]
    fn phone_is_none_without_snippet() {
        let record = EtlPipeline::new()
            .transform(&result(
                "https://example-eats.com/",
                "Example Eats",
                None,
            ))
            .expect("business-like result should transform");
        assert!(record.phone.is_none());
    }

    #[test]
    fn extracts_coords_from_google_maps_url() {
        let url = "https://www.google.com/maps/place/Zeke%27s+Kitchen+%26+Bar/data=!4m7!3m6!1s0x88f51bb124850d29:0x2d3b6823e4feddcb!8m2!3d33.8455382!4d-84.5043073!16s%2Fg%2F11s0wf2y_s?authuser=0&hl=en";
        let record = EtlPipeline::new()
            .transform(&result(
                url,
                "Zeke's Kitchen & Bar",
                None,
            ))
            .expect("business-like result should transform");
        assert_eq!(record.lat, Some(33.845_538_2));
        assert_eq!(record.lng, Some(-84.504_307_3));
    }

    #[test]
    fn coords_are_none_for_non_maps_urls() {
        let record = EtlPipeline::new()
            .transform(&result(
                "https://example-eats.com/",
                "Example Eats",
                None,
            ))
            .expect("business-like result should transform");
        assert_eq!(record.lat, None);
        assert_eq!(record.lng, None);
    }

    #[test]
    fn rejects_listicle_and_directory_titles() {
        let etl = EtlPipeline::new();
        assert!(
            etl.transform(&result(
                "https://x.com/50-restaurants",
                "50 Outstanding Black-Owned Restaurants in Atlanta",
                None,
            ))
            .is_none()
        );
        assert!(
            etl.transform(&result(
                "https://x.com/guide",
                "The Definitive Guide to 12 Black-Owned Cafes",
                None,
            ))
            .is_none()
        );
        assert!(
            etl.transform(&result(
                "https://x.com/dir",
                "Black Owned Restaurants Directory",
                None,
            ))
            .is_none()
        );
    }

    #[test]
    fn rejects_unplausible_titles() {
        let etl = EtlPipeline::new();
        assert!(etl.transform(&result("https://x.com/", "Jo", None)).is_none());
        assert!(
            etl
                .transform(&result(
                    "https://x.com/",
                    &"R".repeat(201),
                    None,
                ))
                .is_none()
        );
    }

    #[test]
    fn source_id_is_stable_and_distinct() {
        assert_eq!(
            stable_source_id("https://a.com/"),
            stable_source_id("https://a.com/")
        );
        assert_ne!(
            stable_source_id("https://a.com/"),
            stable_source_id("https://b.com/")
        );
    }
}
