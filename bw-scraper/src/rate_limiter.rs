//! Rate limiting for scraper requests
//!
//! Implements a minimum delay between requests with random jitter
//! to prevent pattern detection by target servers.

use std::time::Duration;
use tokio::time::sleep;
use tracing::debug;

/// Rate limiter configuration
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Minimum delay between requests in milliseconds
    pub min_delay_ms: u64,
    /// Maximum jitter in milliseconds (added randomly to delay)
    pub max_jitter_ms: u64,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            // 2 second minimum delay as per AC requirement
            min_delay_ms: 2000,
            // Up to 500ms of random jitter to prevent pattern detection
            max_jitter_ms: 500,
        }
    }
}

/// Rate limiter for controlling request timing
pub struct RateLimiter {
    config: RateLimiterConfig,
    last_request_time: Option<std::time::Instant>,
}

impl RateLimiter {
    /// Create a new rate limiter with default configuration
    #[must_use]
    pub fn new() -> Self {
        Self::with_config(RateLimiterConfig::default())
    }

    /// Create a new rate limiter with custom configuration
    #[must_use]
    pub fn with_config(config: RateLimiterConfig) -> Self {
        Self {
            config,
            last_request_time: None,
        }
    }

    /// Calculate the delay before the next request
    /// Returns the base delay plus random jitter
    fn calculate_delay(&self) -> Duration {
        let base_delay = Duration::from_millis(self.config.min_delay_ms);

        // Add random jitter to prevent pattern detection
        let jitter_ms = if self.config.max_jitter_ms > 0 {
            fastrand::u64(0..=self.config.max_jitter_ms)
        } else {
            0
        };

        let total_delay = base_delay + Duration::from_millis(jitter_ms);

        debug!(
            "Calculated delay: {:?} (base: {:?}, jitter: {}ms)",
            total_delay, base_delay, jitter_ms
        );

        total_delay
    }

    /// Wait for the appropriate delay before making a request
    /// Returns immediately if this is the first request
    ///
    /// # Panics
    ///
    /// Panics if the computed wait time cannot be represented — cannot occur
    /// because the wait is only computed when `elapsed < required_delay`.
    pub async fn wait_before_request(&mut self) {
        if let Some(last_time) = self.last_request_time {
            let elapsed = last_time.elapsed();
            let required_delay = self.calculate_delay();

            if elapsed < required_delay {
                let wait_time = required_delay.checked_sub(elapsed).unwrap();
                debug!(
                    "Rate limiting: waiting {:?} (elapsed: {:?}, required: {:?})",
                    wait_time, elapsed, required_delay
                );
                sleep(wait_time).await;
            } else {
                debug!(
                    "No delay needed: elapsed {:?} exceeds required {:?}",
                    elapsed, required_delay
                );
            }
        }

        // Update last request time
        self.last_request_time = Some(std::time::Instant::now());
    }

    /// Get the configured minimum delay
    #[must_use]
    pub fn min_delay(&self) -> Duration {
        Duration::from_millis(self.config.min_delay_ms)
    }

    /// Get the configured maximum jitter
    #[must_use]
    pub fn max_jitter(&self) -> Duration {
        Duration::from_millis(self.config.max_jitter_ms)
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_default_config() {
        let config = RateLimiterConfig::default();
        assert_eq!(config.min_delay_ms, 2000);
        assert_eq!(config.max_jitter_ms, 500);
    }

    #[test]
    fn test_custom_config() {
        let config = RateLimiterConfig {
            min_delay_ms: 1000,
            max_jitter_ms: 200,
        };
        assert_eq!(config.min_delay_ms, 1000);
        assert_eq!(config.max_jitter_ms, 200);
    }

    #[test]
    fn test_calculate_delay_includes_jitter() {
        let config = RateLimiterConfig {
            min_delay_ms: 2000,
            max_jitter_ms: 500,
        };
        let limiter = RateLimiter::with_config(config);

        // Run multiple times to verify jitter varies
        let mut delays = Vec::new();
        for _ in 0..10 {
            let delay = limiter.calculate_delay();
            delays.push(delay.as_millis());
        }

        // All delays should be at least 2000ms
        for delay in &delays {
            assert!(*delay >= 2000, "Delay {delay} should be >= 2000ms");
        }

        // All delays should be at most 2500ms (2000 + 500)
        for delay in &delays {
            assert!(*delay <= 2500, "Delay {delay} should be <= 2500ms");
        }

        // Verify jitter actually varies (at least some different values)
        let unique_delays: std::collections::HashSet<_> = delays.iter().collect();
        assert!(unique_delays.len() > 1, "Jitter should produce varying delays");
    }

    #[test]
    fn test_calculate_delay_zero_jitter() {
        let config = RateLimiterConfig {
            min_delay_ms: 2000,
            max_jitter_ms: 0,
        };
        let limiter = RateLimiter::with_config(config);

        // All delays should be exactly 2000ms
        for _ in 0..5 {
            let delay = limiter.calculate_delay();
            assert_eq!(delay.as_millis(), 2000, "Delay should be exactly 2000ms with zero jitter");
        }
    }

    #[tokio::test]
    async fn test_first_request_no_delay() {
        let mut limiter = RateLimiter::new();

        // First request should return immediately (no last_request_time)
        let start = Instant::now();
        limiter.wait_before_request().await;
        let elapsed = start.elapsed();

        // Should be very fast (less than 100ms)
        assert!(elapsed.as_millis() < 100, "First request should not delay, but took {elapsed:?}");
    }

    #[tokio::test]
    async fn test_subsequent_request_delays() {
        let config = RateLimiterConfig {
            min_delay_ms: 100, // Use shorter delay for test
            max_jitter_ms: 0,  // No jitter for predictable test
        };
        let mut limiter = RateLimiter::with_config(config);

        // First request
        limiter.wait_before_request().await;

        // Second request should delay at least 100ms
        let start = Instant::now();
        limiter.wait_before_request().await;
        let elapsed = start.elapsed();

        assert!(
            elapsed.as_millis() >= 100,
            "Second request should delay at least 100ms, but only took {elapsed:?}"
        );
    }

    #[tokio::test]
    async fn test_delay_respects_elapsed_time() {
        let config = RateLimiterConfig {
            min_delay_ms: 100,
            max_jitter_ms: 0,
        };
        let mut limiter = RateLimiter::with_config(config);

        // First request
        limiter.wait_before_request().await;

        // Wait longer than the required delay
        sleep(Duration::from_millis(150)).await;

        // Next request should not delay (or delay very little)
        let start = Instant::now();
        limiter.wait_before_request().await;
        let elapsed = start.elapsed();

        // Should be fast since we already waited
        assert!(
            elapsed.as_millis() < 50,
            "Request should not delay when enough time has elapsed, but took {elapsed:?}"
        );
    }

    #[tokio::test]
    async fn test_rate_limiter_integration_multiple_requests() {
        let config = RateLimiterConfig {
            min_delay_ms: 50,
            max_jitter_ms: 0,
        };
        let mut limiter = RateLimiter::with_config(config);

        let mut total_time = Duration::ZERO;

        // Make 5 requests
        for i in 0..5 {
            let start = Instant::now();
            limiter.wait_before_request().await;
            total_time += start.elapsed();

            debug!("Request {} took {:?}", i + 1, start.elapsed());
        }

        // First request has no delay, remaining 4 should each delay at least 50ms
        // So total should be at least 200ms (4 * 50ms)
        assert!(
            total_time.as_millis() >= 200,
            "5 requests with 50ms minimum delay should take at least 200ms, but took {total_time:?}"
        );
    }

    #[test]
    fn test_getters() {
        let config = RateLimiterConfig {
            min_delay_ms: 2000,
            max_jitter_ms: 500,
        };
        let limiter = RateLimiter::with_config(config);

        assert_eq!(limiter.min_delay(), Duration::from_secs(2));
        assert_eq!(limiter.max_jitter(), Duration::from_millis(500));
    }
}
