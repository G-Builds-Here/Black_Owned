//! Web scraping logic for bw-scraper

use crate::bot_detection::{BotChallenge, BotDetector};
use anyhow::Result;
use scraper::{Html, Selector};
use tracing::{info, warn};

/// Scraper source types
#[derive(Debug, Clone, PartialEq)]
pub enum ScraperSource {
    GoogleMaps,
    Yelp,
    Facebook,
}

impl std::fmt::Display for ScraperSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScraperSource::GoogleMaps => write!(f, "Google Maps"),
            ScraperSource::Yelp => write!(f, "Yelp"),
            ScraperSource::Facebook => write!(f, "Facebook"),
        }
    }
}

/// Business data extracted from scraping
#[derive(Debug, Clone)]
pub struct BusinessData {
    pub name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub category: Option<String>,
    pub rating: Option<f32>,
}

/// Scraper service for extracting business data
pub struct ScraperService {
    source: ScraperSource,
    bot_detector: BotDetector,
}

impl ScraperService {
    /// Create a new scraper for the given source
    pub fn new(source: ScraperSource) -> Self {
        Self {
            source,
            bot_detector: BotDetector::new(),
        }
    }

    /// Check if the response indicates a bot challenge
    ///
    /// Returns true if a bot challenge is detected, false otherwise
    pub fn check_for_bot_challenge(&self, html_content: &str, url: &str) -> bool {
        self.bot_detector.is_bot_challenge(html_content)
            || self.bot_detector.is_challenge_status(0) // Status check would be passed in real usage
    }

    /// Handle a detected bot challenge
    ///
    /// Logs the event and pauses for 60 seconds before retry
    pub async fn handle_bot_challenge(&self, source: &str, url: &str) {
        let challenge = BotChallenge::new(source, url);
        self.bot_detector.handle_challenge(&challenge).await;
    }

    /// Scrape businesses from the source
    pub async fn scrape(&self, query: &str, location: &str) -> Result<Vec<BusinessData>> {
        info!("Scraping {} for '{}' in '{}'", self.source, query, location);

        match &self.source {
            ScraperSource::GoogleMaps => self.scrape_google_maps(query, location).await,
            ScraperSource::Yelp => self.scrape_yelp(query, location).await,
            ScraperSource::Facebook => self.scrape_facebook(query, location).await,
        }
    }

    async fn scrape_google_maps(&self, _query: &str, _location: &str) -> Result<Vec<BusinessData>> {
        // Google Maps scraping implementation
        // Note: In production, this would use the Google Places API
        warn!("Google Maps scraping requires API key configuration");
        Ok(vec![])
    }

    async fn scrape_yelp(&self, _query: &str, _location: &str) -> Result<Vec<BusinessData>> {
        // Yelp scraping implementation
        // Note: In production, this would use the Yelp Fusion API
        warn!("Yelp scraping requires API key configuration");
        Ok(vec![])
    }

    async fn scrape_facebook(&self, _query: &str, _location: &str) -> Result<Vec<BusinessData>> {
        // Facebook scraping implementation
        // Note: In production, this would use the Graph API
        warn!("Facebook scraping requires API key configuration");
        Ok(vec![])
    }

    /// Parse HTML content and extract business information
    pub fn parse_html(&self, html: &str) -> Result<Vec<BusinessData>> {
        let document = Html::parse_document(html);
        let business_selector = Selector::parse("div.business-card").map_err(|e| {
            anyhow::anyhow!("Failed to parse business selector: {}", e)
        })?;

        let businesses: Vec<BusinessData> = document
            .select(&business_selector)
            .map(|element| {
                let name = element
                    .select(&Selector::parse("h2.name").unwrap())
                    .next()
                    .map(|e| e.text().collect::<String>())
                    .unwrap_or_default();

                BusinessData {
                    name,
                    address: None,
                    phone: None,
                    website: None,
                    category: None,
                    rating: None,
                }
            })
            .collect();

        Ok(businesses)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scraper_source_creation() {
        let _google = ScraperService::new(ScraperSource::GoogleMaps);
        let _yelp = ScraperService::new(ScraperSource::Yelp);
        let _facebook = ScraperService::new(ScraperSource::Facebook);
    }

    #[test]
    fn test_scraper_has_bot_detector() {
        let scraper = ScraperService::new(ScraperSource::GoogleMaps);
        // Verify bot detector is initialized
        let html = r#"<html><body><div class="g-recaptcha">Verify you are human</div></body></html>"#;
        assert!(scraper.check_for_bot_challenge(html, "https://example.com"));
    }

    #[test]
    fn test_scraper_normal_page_no_challenge() {
        let scraper = ScraperService::new(ScraperSource::GoogleMaps);
        let html = r#"<html><body><h1>Normal page content</h1></body></html>"#;
        assert!(!scraper.check_for_bot_challenge(html, "https://example.com"));
    }

    #[test]
    fn test_parse_html() {
        let scraper = ScraperService::new(ScraperSource::GoogleMaps);
        let html = r#"
            <html>
                <body>
                    <div class="business-card">
                        <h2 class="name">Test Business</h2>
                    </div>
                </body>
            </html>
        "#;

        let result = scraper.parse_html(html);
        assert!(result.is_ok());
    }
}
