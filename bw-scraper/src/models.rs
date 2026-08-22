//! Record types shared across the scrape pipeline.

/// One business record extracted from a search result.
///
/// Mirrors the `scraped_businesses` table. Extraction is snippet-only:
/// fields that SearXNG results do not carry stay `None` rather than being
/// fabricated.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScrapedBusinessRecord {
    pub name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub website: String,
    pub category: Option<String>,
    pub rating: Option<f64>,
    pub review_count: Option<i32>,
    pub source_id: String,
}
