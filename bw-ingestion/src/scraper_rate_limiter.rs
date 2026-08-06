//! Scraper rate limiter with jitter.
//!
//! Implements rate limiting between scraper requests with:
//! - Minimum 2-second delay between requests
//! - Random jitter (0-500ms) to prevent pattern detection

use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::time::sleep;
use rand::Rng;

/// Scraper rate limiter with jitter
///
/// Ensures a minimum delay between requests with randomized jitter
/// to prevent detection patterns.
pub struct ScraperRateLimiter {
    /// Last request timestamp
    last_request: Mutex<Option<Instant>>,
    /// Minimum delay between requests (2 seconds)
    min_delay_ms: u64,
    /// Maximum jitter to add (500ms)
    max_jitter_ms: u64,
}

impl ScraperRateLimiter {
    /// Create a new rate limiter with default settings
    ///
    /// Default: 2000ms minimum delay, 500ms max jitter
    #[must_use]
    pub fn new() -> Self {
        Self {
            last_request: Mutex::new(None),
            min_delay_ms: 2000,
            max_jitter_ms: 500,
        }
    }

    /// Create a new rate limiter with custom settings
    ///
    /// # Arguments
    /// * `min_delay_ms` - Minimum delay between requests in milliseconds
    /// * `max_jitter_ms` - Maximum random jitter to add in milliseconds
    #[must_use]
    pub fn with_config(min_delay_ms: u64, max_jitter_ms: u64) -> Self {
        Self {
            last_request: Mutex::new(None),
            min_delay_ms,
            max_jitter_ms,
        }
    }

    /// Wait for the rate limit delay before making a request
    ///
    /// This method blocks until the required delay has passed,
    /// including any randomized jitter.
    pub async fn wait(&self) {
        // Calculate wait time while holding the lock
        let wait_duration = {
            let mut last_request = self.last_request.lock().await;

            let wait_time = if let Some(last) = *last_request {
                let elapsed = last.elapsed().as_millis() as u64;

                if elapsed < self.min_delay_ms {
                    let remaining = self.min_delay_ms - elapsed;

                    // Add random jitter (0 to max_jitter_ms)
                    let jitter = if self.max_jitter_ms > 0 {
                        let mut rng = rand::thread_rng();
                        rng.gen_range(0..=self.max_jitter_ms)
                    } else {
                        0
                    };

                    remaining + jitter
                } else {
                    0
                }
            } else {
                0
            };

            // Update the timestamp before releasing the lock
            *last_request = Some(Instant::now());

            wait_time
        };

        // Sleep outside the lock
        if wait_duration > 0 {
            sleep(Duration::from_millis(wait_duration)).await;
        }
    }

    /// Get the minimum delay configuration
    #[must_use]
    pub fn min_delay_ms(&self) -> u64 {
        self.min_delay_ms
    }

    /// Get the maximum jitter configuration
    #[must_use]
    pub fn max_jitter_ms(&self) -> u64 {
        self.max_jitter_ms
    }
}

impl Default for ScraperRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn test_rate_limiter_new() {
        let limiter = ScraperRateLimiter::new();
        assert_eq!(limiter.min_delay_ms(), 2000);
        assert_eq!(limiter.max_jitter_ms(), 500);
    }

    #[test]
    fn test_rate_limiter_with_config() {
        let limiter = ScraperRateLimiter::with_config(1000, 200);
        assert_eq!(limiter.min_delay_ms(), 1000);
        assert_eq!(limiter.max_jitter_ms(), 200);
    }

    #[tokio::test]
    async fn test_first_request_no_delay() {
        let limiter = ScraperRateLimiter::with_config(100, 50);
        let start = Instant::now();
        limiter.wait().await;
        let elapsed = start.elapsed();

        // First request should return immediately (no previous request)
        assert!(elapsed < Duration::from_millis(10));
    }

    #[tokio::test]
    async fn test_second_request_waits_for_delay() {
        let limiter = ScraperRateLimiter::with_config(100, 0);

        // First request
        limiter.wait().await;

        // Second request should wait at least 100ms
        let start = Instant::now();
        limiter.wait().await;
        let elapsed = start.elapsed();

        assert!(
            elapsed >= Duration::from_millis(100),
            "Expected at least 100ms delay, got {:?}",
            elapsed
        );
    }

    #[tokio::test]
    async fn test_rate_limiter_allows_after_delay() {
        let limiter = ScraperRateLimiter::with_config(50, 0);

        // First request
        limiter.wait().await;

        // Wait longer than the minimum delay
        sleep(Duration::from_millis(100)).await;

        // Next request should return quickly
        let start = Instant::now();
        limiter.wait().await;
        let elapsed = start.elapsed();

        // Should not wait much since we already waited past the delay
        assert!(elapsed < Duration::from_millis(60));
    }

    #[tokio::test]
    async fn test_jitter_adds_to_delay() {
        let limiter = ScraperRateLimiter::with_config(100, 50);

        // First request - no delay expected
        limiter.wait().await;

        // Immediately call wait again - should wait at least 100ms plus jitter
        let start = Instant::now();
        limiter.wait().await;
        let elapsed = start.elapsed().as_millis();

        // Verify delay is at least 100ms (min_delay)
        assert!(
            elapsed >= 100,
            "Delay should be at least 100ms, got {}ms",
            elapsed
        );

        // With proper random jitter, verify delay is at least min_delay
        // Jitter adds 0-50ms variation, so total should be 100-150ms
        assert!(
            elapsed >= 100,
            "Delay with jitter should be at least min_delay, got {}ms",
            elapsed
        );
    }

    #[tokio::test]
    async fn test_concurrent_requests_serialized() {
        let limiter = Arc::new(ScraperRateLimiter::with_config(50, 0));

        let limiter1 = limiter.clone();
        let limiter2 = limiter.clone();

        let handle1 = tokio::spawn(async move {
            let start = Instant::now();
            limiter1.wait().await;
            start.elapsed()
        });

        let handle2 = tokio::spawn(async move {
            let start = Instant::now();
            limiter2.wait().await;
            start.elapsed()
        });

        let result1 = handle1.await.unwrap();
        let result2 = handle2.await.unwrap();

        // First request should be quick
        assert!(result1 < Duration::from_millis(10));

        // Second request should wait for the delay
        assert!(
            result2 >= Duration::from_millis(50),
            "Second request should wait for rate limit"
        );
    }

    #[tokio::test]
    async fn test_ac_minimum_delay_validation() {
        // AC requirement: minimum 2-second delay between requests
        // Test with default configuration (2000ms min delay)
        let limiter = ScraperRateLimiter::new();

        // First request - no delay expected
        let start = Instant::now();
        limiter.wait().await;
        let first_elapsed = start.elapsed();
        assert!(
            first_elapsed < Duration::from_millis(10),
            "First request should return immediately, got {:?}",
            first_elapsed
        );

        // Second request should wait at least 2 seconds
        let start = Instant::now();
        limiter.wait().await;
        let elapsed = start.elapsed();

        assert!(
            elapsed >= Duration::from_millis(2000),
            "AC requirement: minimum 2-second delay. Expected >= 2000ms, got {:?}",
            elapsed
        );
    }

    #[tokio::test]
    async fn test_ac_random_jitter_validation() {
        // AC requirement: random jitter to prevent pattern detection
        // Run multiple iterations to verify jitter produces variable delays
        let mut delays = Vec::new();

        for _ in 0..5 {
            let limiter = ScraperRateLimiter::with_config(100, 50);

            // First request
            limiter.wait().await;

            // Second request - should be 100ms + 0-50ms jitter
            let start = Instant::now();
            limiter.wait().await;
            delays.push(start.elapsed().as_millis());
        }

        // Verify all delays are at least the minimum (100ms)
        for delay in &delays {
            assert!(
                *delay >= 100,
                "Delay should be at least min_delay (100ms), got {}ms",
                delay
            );
        }

        // Verify jitter produces variation (not all delays are identical)
        // Note: With 50ms jitter range, there's a small chance all 5 could be the same
        // but it's extremely unlikely. This validates the jitter is working.
        let all_same = delays.iter().all(|&d| d == delays[0]);
        assert!(
            !all_same,
            "Jitter should produce variable delays. All delays were identical: {:?}",
            delays
        );
    }
}
