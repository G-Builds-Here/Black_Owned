//! SearXNG-backed business discovery.
//!
//! Stage 1 of the two-stage pipeline: ask SearXNG for web results about a
//! business query + location. Stage 2 (etl) keeps only business-like hits.

use std::collections::HashSet;

use anyhow::Result;
use tracing::{info, warn};

use crate::etl::EtlPipeline;
use crate::models::ScrapedBusinessRecord;
use crate::rate_limiter::RateLimiter;
use crate::searxng::SearxngClient;

/// A results page shorter than this means pagination is exhausted.
const SHORT_PAGE_THRESHOLD: usize = 20;

pub struct SearxngBusinessScraper {
    client: SearxngClient,
    etl: EtlPipeline,
    rate_limiter: RateLimiter,
}

impl SearxngBusinessScraper {
    pub fn new(client: SearxngClient, etl: EtlPipeline, rate_limiter: RateLimiter) -> Self {
        Self {
            client,
            etl,
            rate_limiter,
        }
    }

    /// Discover businesses across up to `max_pages` result pages.
    pub async fn scrape(
        &mut self,
        query: &str,
        location: &str,
        max_pages: u32,
    ) -> Result<Vec<ScrapedBusinessRecord>> {
        let full_query = format!("{query} {location}");
        let mut records: Vec<ScrapedBusinessRecord> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        for pageno in 1..=max_pages.max(1) {
            self.rate_limiter.wait_before_request().await;
            info!(query = %full_query, pageno, "querying SearXNG");

            let response = self.client.search(&full_query, pageno).await?;

            if !response.unresponsive_engines.is_empty() {
                warn!(
                    suspended = ?response.unresponsive_engines,
                    "SearXNG engines suspended; result set may be degraded"
                );
            }

            for result in &response.results {
                if let Some(record) = self.etl.transform(result) {
                    if seen.insert(record.source_id.clone()) {
                        records.push(record);
                    }
                }
            }

            if response.results.len() < SHORT_PAGE_THRESHOLD {
                info!(
                    pageno,
                    total = response.results.len(),
                    "short page; stopping pagination"
                );
                break;
            }
        }

        info!(query = %full_query, businesses = records.len(), "discovery complete");
        Ok(records)
    }
}
