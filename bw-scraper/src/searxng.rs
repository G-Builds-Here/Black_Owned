//! `SearXNG` metasearch discovery client.
//!
//! `SearXNG` is a privacy-focused metasearch engine: it fans a query out to
//! multiple upstream engines (google cse, duckduckgo, brave, ...) and returns
//! one merged, deduplicated, ranked result list. Results are web hits
//! (url, title, snippet, engine, score), not structured business records —
//! the ETL stage turns promising candidates into business data.

use std::time::Duration;
use std::fmt::Write;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// One merged result from a `SearXNG` search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearxngResult {
    pub url: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: Option<String>,
    /// Primary engine that produced this result.
    #[serde(default)]
    pub engine: Option<String>,
    /// All engines that returned this URL (merged-dedupe signal).
    #[serde(default)]
    pub engines: Vec<String>,
    #[serde(default)]
    pub score: Option<f64>,
    #[serde(default)]
    pub img_src: Option<String>,
}

/// Full JSON response from `GET /search?format=json`.
#[derive(Debug, Clone, Deserialize)]
pub struct SearxngResponse {
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub results: Vec<SearxngResult>,
    /// Upstream engines currently suspended by `SearXNG`'s circuit breaker,
    /// as [engine, reason] pairs. Non-empty means the result set is degraded.
    #[serde(default)]
    pub unresponsive_engines: Vec<Vec<String>>,
}

/// HTTP client for a `SearXNG` instance.
#[derive(Debug, Clone)]
pub struct SearxngClient {
    http: reqwest::Client,
    base_url: String,
}

impl SearxngClient {
    /// Create a client for the instance at `base_url`
    /// (e.g. `http://192.168.68.50:8888`).
    ///
    /// # Panics
    ///
    /// Panics if the reqwest client cannot be built (should not occur with
    /// the default configuration).
    #[must_use]
    pub fn new(base_url: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent("BlackOwnedDirectory/1.0 (business discovery scraper)")
            .build()
            .expect("reqwest client builds with default settings");
        Self {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    /// Run one search page. `pageno` is 1-based.
    ///
    /// # Errors
    ///
    /// Returns an error if the request fails, the instance responds with a
    /// non-2xx status, or the response body is not valid JSON.
    pub async fn search(&self, query: &str, pageno: u32) -> Result<SearxngResponse> {
        let url = format!(
            "{}/search?q={}&format=json&pageno={}",
            self.base_url,
            urlencoding_form_urlencode(query),
            pageno
        );
        let response = self
            .http
            .get(&url)
            .send()
            .await
            .with_context(|| format!("SearXNG request failed: {query}"))?
            .error_for_status()
            .with_context(|| "SearXNG returned an error status")?;
        let body: SearxngResponse = response
            .json()
            .await
            .context("SearXNG returned invalid JSON")?;
        Ok(body)
    }
}

fn urlencoding_form_urlencode(s: &str) -> String {
    // Minimal percent-encoding for query strings (SearXNG accepts URL-encoded q).
    let mut out = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            b' ' => out.push('+'),
            _ => {
                let _ = write!(out, "%{byte:02X}");
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"{
        "query": "black owned restaurants Atlanta",
        "results": [
            {
                "url": "https://www.example-eats.com/",
                "title": "Example Eats | Our Restaurant",
                "content": "Visit us at 12 Peachtree Ln, Atlanta. Call (404) 555-0123.",
                "engine": "google cse",
                "engines": ["google cse", "duckduckgo"],
                "score": 1.0,
                "img_src": "https://www.example-eats.com/logo.png"
            },
            {
                "url": "https://www.atlantaeats.com/blog/50-black-owned-restaurants-in-atlanta/",
                "title": "50 Outstanding Black-Owned Restaurants in Atlanta",
                "content": "A directory of the city's best...",
                "engine": "duckduckgo",
                "engines": ["duckduckgo"],
                "score": 0.9
            }
        ],
        "unresponsive_engines": [["brave", "Suspended: too many requests"]]
    }"#;

    #[test]
    fn parses_full_response() {
        let parsed: SearxngResponse = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(parsed.query.as_deref(), Some("black owned restaurants Atlanta"));
        assert_eq!(parsed.results.len(), 2);
        assert_eq!(parsed.results[0].url, "https://www.example-eats.com/");
        assert_eq!(parsed.results[0].engines, vec!["google cse", "duckduckgo"]);
        assert_eq!(parsed.results[1].engine.as_deref(), Some("duckduckgo"));
        assert!(parsed.results[1].img_src.is_none());
        assert_eq!(parsed.unresponsive_engines.len(), 1);
        assert_eq!(parsed.unresponsive_engines[0][0], "brave");
    }

    #[test]
    fn parses_minimal_response_with_defaults() {
        let parsed: SearxngResponse = serde_json::from_str(r#"{"results": []}"#).unwrap();
        assert!(parsed.query.is_none());
        assert!(parsed.results.is_empty());
        assert!(parsed.unresponsive_engines.is_empty());
    }

    #[test]
    fn encodes_query_for_url() {
        assert_eq!(urlencoding_form_urlencode("black owned restaurants"), "black+owned+restaurants");
        assert_eq!(urlencoding_form_urlencode("a b & c"), "a+b+%26+c");
        assert_eq!(urlencoding_form_urlencode("simple"), "simple");
    }
}
