//! Bot detection and handling module
//!
//! This module provides functionality for detecting bot challenges
//! and implementing retry logic with appropriate delays.

use std::time::Duration;
use tracing::{info, warn};

/// Default pause duration when a bot challenge is detected (60 seconds)
pub const DEFAULT_RETRY_DELAY_SECS: u64 = 60;

/// Represents a bot challenge detected during scraping
#[derive(Debug, Clone)]
pub struct BotChallenge {
    /// The source where the challenge was detected
    pub source: String,
    /// The URL that triggered the challenge
    pub url: String,
    /// Timestamp when the challenge was detected
    pub detected_at: chrono::DateTime<chrono::Utc>,
}

impl BotChallenge {
    /// Create a new bot challenge instance
    pub fn new(source: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            source: source.into(),
            url: url.into(),
            detected_at: chrono::Utc::now(),
        }
    }
}

/// Bot detector for identifying and handling bot challenges
pub struct BotDetector {
    /// Pause duration when a challenge is detected
    retry_delay: Duration,
}

impl Default for BotDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl BotDetector {
    /// Create a new bot detector with default settings
    pub fn new() -> Self {
        Self {
            retry_delay: Duration::from_secs(DEFAULT_RETRY_DELAY_SECS),
        }
    }

    /// Create a new bot detector with custom retry delay
    pub fn with_retry_delay(delay_secs: u64) -> Self {
        Self {
            retry_delay: Duration::from_secs(delay_secs),
        }
    }

    /// Check if the response body indicates a bot challenge
    ///
    /// Common bot challenge indicators:
    /// - reCAPTCHA pages
    /// - Cloudflare challenge pages
    /// - "Unusual traffic" messages
    /// - "Verify you are human" prompts
    pub fn is_bot_challenge(&self, html_content: &str) -> bool {
        let lower_content = html_content.to_lowercase();

        // Common bot challenge indicators
        let challenge_indicators = [
            "captcha",
            "recaptcha",
            "verify you are human",
            "unusual traffic",
            "cloudflare",
            "please wait while we verify",
            "checking your browser",
            "ddos protection",
            "ray id",
            "please complete the security check",
            "prove you are human",
            "human verification",
            "security check",
            "bot detection",
            "automated request",
        ];

        challenge_indicators.iter().any(|indicator| {
            lower_content.contains(indicator)
        })
    }

    /// Check if HTTP status code suggests a challenge/block
    pub fn is_challenge_status(&self, status_code: u16) -> bool {
        // 403 Forbidden often indicates bot blocking
        // 429 Too Many Requests indicates rate limiting
        // 503 Service Unavailable can indicate challenge pages
        matches!(status_code, 403 | 429 | 503)
    }

    /// Handle a detected bot challenge
    ///
    /// This method:
    /// 1. Logs the challenge event
    /// 2. Returns the recommended retry delay
    pub async fn handle_challenge(&self, challenge: &BotChallenge) -> Duration {
        warn!(
            bot_challenge = true,
            source = %challenge.source,
            url = %challenge.url,
            detected_at = %challenge.detected_at.to_rfc3339(),
            "Bot challenge detected - pausing before retry"
        );

        info!(
            pause_duration_secs = self.retry_delay.as_secs(),
            "Pausing for {} seconds before retry",
            self.retry_delay.as_secs()
        );

        // Actually pause execution
        tokio::time::sleep(self.retry_delay).await;

        self.retry_delay
    }

    /// Get the configured retry delay
    pub fn retry_delay(&self) -> Duration {
        self.retry_delay
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bot_challenge_creation() {
        let challenge = BotChallenge::new("google_maps", "https://example.com");
        assert_eq!(challenge.source, "google_maps");
        assert_eq!(challenge.url, "https://example.com");
        assert!(challenge.detected_at <= chrono::Utc::now());
    }

    #[test]
    fn test_is_bot_challenge_recaptcha() {
        let detector = BotDetector::new();
        let html = r#"
            <html>
                <body>
                    <div class="g-recaptcha">Verify you are human</div>
                </body>
            </html>
        "#;
        assert!(detector.is_bot_challenge(html));
    }

    #[test]
    fn test_is_bot_challenge_cloudflare() {
        let detector = BotDetector::new();
        let html = r#"
            <html>
                <body>
                    <h1>Checking your browser before accessing</h1>
                    <p>Ray ID: 12345678</p>
                </body>
            </html>
        "#;
        assert!(detector.is_bot_challenge(html));
    }

    #[test]
    fn test_is_bot_challenge_unusual_traffic() {
        let detector = BotDetector::new();
        let html = r#"
            <html>
                <body>
                    <h1>Our system has detected unusual traffic from your network</h1>
                </body>
            </html>
        "#;
        assert!(detector.is_bot_challenge(html));
    }

    #[test]
    fn test_is_bot_challenge_normal_page() {
        let detector = BotDetector::new();
        let html = r#"
            <html>
                <body>
                    <h1>Welcome to our website</h1>
                    <p>This is a normal page with no challenges.</p>
                </body>
            </html>
        "#;
        assert!(!detector.is_bot_challenge(html));
    }

    #[test]
    fn test_is_challenge_status() {
        let detector = BotDetector::new();
        assert!(detector.is_challenge_status(403));
        assert!(detector.is_challenge_status(429));
        assert!(detector.is_challenge_status(503));
        assert!(!detector.is_challenge_status(200));
        assert!(!detector.is_challenge_status(404));
    }

    #[test]
    fn test_default_retry_delay() {
        let detector = BotDetector::new();
        assert_eq!(detector.retry_delay(), Duration::from_secs(60));
    }

    #[test]
    fn test_custom_retry_delay() {
        let detector = BotDetector::with_retry_delay(120);
        assert_eq!(detector.retry_delay(), Duration::from_secs(120));
    }
}
