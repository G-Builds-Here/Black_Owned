//! Rate limiting middleware for axum API.
//!
//! Implements per-token (authenticated user) and per-IP rate limiting
//! using an in-memory store with tokio::sync::RwLock.

use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode, header},
    response::Response,
};
use std::{
    net::SocketAddr,
    sync::Arc,
    time::Instant,
};
use tower_layer::Layer;
use tokio::sync::RwLock;

/// Rate limit configuration
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Max requests per minute for authenticated users
    pub authenticated_limit: u32,
    /// Max requests per minute for unauthenticated IPs
    pub unauthenticated_limit: u32,
    /// Time window in seconds
    pub window_seconds: u64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            authenticated_limit: 100,
            unauthenticated_limit: 30,
            window_seconds: 60,
        }
    }
}

/// Request counter for a single key
#[derive(Debug, Clone)]
struct RequestCounter {
    /// Number of requests in the current window
    count: u32,
    /// Start time of the current window
    window_start: Instant,
}

/// In-memory rate limiter store
#[derive(Debug, Clone)]
pub(crate) struct RateLimiterStore {
    /// Map of rate limit keys to their counters
    counters: Arc<RwLock<std::collections::HashMap<String, RequestCounter>>>,
    /// Configuration for rate limiting
    config: RateLimitConfig,
}

impl RateLimiterStore {
    fn new(config: RateLimitConfig) -> Self {
        Self {
            counters: Arc::new(RwLock::new(std::collections::HashMap::new())),
            config,
        }
    }

    /// Check if a request is allowed and update the counter
    async fn check_and_record(&self, key: &str) -> Result<u64, u64> {
        let mut counters = self.counters.write().await;
        let now = Instant::now();
        let window_seconds = self.config.window_seconds;

        let counter = counters.entry(key.to_string()).or_insert_with(|| {
            RequestCounter {
                count: 0,
                window_start: now,
            }
        });

        // Reset window if expired
        if now.duration_since(counter.window_start).as_secs() >= window_seconds {
            counter.count = 0;
            counter.window_start = now;
        }

        // Determine limit based on key type
        let limit = if key.starts_with("user:") {
            self.config.authenticated_limit
        } else {
            self.config.unauthenticated_limit
        };

        // Check if limit exceeded
        if counter.count >= limit {
            // Calculate retry-after
            let elapsed = now.duration_since(counter.window_start).as_secs();
            let retry_after = window_seconds - elapsed;
            Err(retry_after)
        } else {
            counter.count += 1;
            Ok(0)
        }
    }
}

/// Rate limiting middleware layer
#[derive(Clone)]
pub struct RateLimitLayer {
    store: Arc<RateLimiterStore>,
}

impl RateLimitLayer {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            store: Arc::new(RateLimiterStore::new(config)),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_store(store: Arc<RateLimiterStore>) -> Self {
        Self { store }
    }
}

impl<S> Layer<S> for RateLimitLayer {
    type Service = RateLimitMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RateLimitMiddleware {
            inner,
            store: self.store.clone(),
        }
    }
}

/// Rate limiting middleware service
pub struct RateLimitMiddleware<S> {
    inner: S,
    store: Arc<RateLimiterStore>,
}

impl<S: Clone> Clone for RateLimitMiddleware<S> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            store: self.store.clone(),
        }
    }
}

/// Extract user ID from Authorization Bearer header
fn extract_user_from_auth(authorization: Option<&str>) -> Option<String> {
    authorization
        .and_then(|auth| {
            if auth.starts_with("Bearer ") {
                Some(auth.trim_start_matches("Bearer ").to_string())
            } else {
                None
            }
        })
        .filter(|token| !token.is_empty())
}

/// Generate rate limit key from request
fn generate_rate_limit_key(
    authorization: Option<&str>,
    remote_addr: Option<&SocketAddr>,
) -> String {
    // Prefer user token for authenticated requests
    if let Some(user_id) = extract_user_from_auth(authorization) {
        return format!("user:{}", user_id);
    }

    // Fall back to IP address for unauthenticated requests
    if let Some(addr) = remote_addr {
        return format!("ip:{}", addr.ip());
    }

    // Fallback key for requests without IP (should not happen in normal operation)
    "unknown".to_string()
}

impl<S> tower::Service<Request<Body>> for RateLimitMiddleware<S>
where
    S: tower::Service<Request<Body>, Response = Response> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = futures::future::LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        // Extract headers and connection info
        let authorization = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok());

        let remote_addr = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ci| &ci.0);

        let rate_limit_key = generate_rate_limit_key(authorization, remote_addr);

        // Clone the service for the async call
        let mut inner = self.inner.clone();
        let store = self.store.clone();

        Box::pin(async move {
            // Check rate limit
            match store.check_and_record(&rate_limit_key).await {
                Ok(_) => {
                    // Request allowed, proceed
                    inner.call(req).await
                }
                Err(retry_after) => {
                    // Rate limit exceeded, return 429
                    let mut response = Response::new(Body::from(
                        "Rate limit exceeded. Please slow down.",
                    ));
                    *response.status_mut() = StatusCode::TOO_MANY_REQUESTS;
                    response
                        .headers_mut()
                        .insert(header::RETRY_AFTER, retry_after.to_string().parse().unwrap());
                    Ok(response)
                }
            }
        })
    }
}

/// Builder for rate limiting middleware
pub struct RateLimiterBuilder {
    config: RateLimitConfig,
}

impl RateLimiterBuilder {
    pub fn new() -> Self {
        Self {
            config: RateLimitConfig::default(),
        }
    }

    pub fn authenticated_limit(mut self, limit: u32) -> Self {
        self.config.authenticated_limit = limit;
        self
    }

    pub fn unauthenticated_limit(mut self, limit: u32) -> Self {
        self.config.unauthenticated_limit = limit;
        self
    }

    pub fn window_seconds(mut self, seconds: u64) -> Self {
        self.config.window_seconds = seconds;
        self
    }

    pub fn build(self) -> RateLimitLayer {
        RateLimitLayer::new(self.config)
    }
}

impl Default for RateLimiterBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        http::{Method, Request, header},
        response::Response,
    };
    use tower::{Service, ServiceExt};

    /// Simple test service that returns 200 OK
    #[derive(Clone)]
    struct TestService;

    impl tower::Service<Request<Body>> for TestService {
        type Response = Response;
        type Error = std::convert::Infallible;
        type Future = futures::future::Ready<Result<Self::Response, Self::Error>>;

        fn poll_ready(
            &mut self,
            _cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), Self::Error>> {
            std::task::Poll::Ready(Ok(()))
        }

        fn call(&mut self, _req: Request<Body>) -> Self::Future {
            futures::future::ready(Ok(Response::builder()
                .status(StatusCode::OK)
                .body(Body::empty())
                .unwrap()))
        }
    }

    #[test]
    fn test_extract_user_from_auth_valid() {
        let auth = Some("Bearer user-123-token");
        let result = extract_user_from_auth(auth);
        assert_eq!(result, Some("user-123-token".to_string()));
    }

    #[test]
    fn test_extract_user_from_auth_no_bearer() {
        let auth = Some("Basic abc123");
        let result = extract_user_from_auth(auth);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_user_from_auth_empty() {
        let auth = Some("");
        let result = extract_user_from_auth(auth);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_user_from_auth_none() {
        let result = extract_user_from_auth(None);
        assert_eq!(result, None);
    }

    #[test]
    fn test_generate_rate_limit_key_authenticated() {
        let auth = Some("Bearer user-123");
        let result = generate_rate_limit_key(auth, None);
        assert_eq!(result, "user:user-123");
    }

    #[test]
    fn test_generate_rate_limit_key_unauthenticated() {
        let addr = SocketAddr::from(([192, 168, 1, 1], 8080));
        let result = generate_rate_limit_key(None, Some(&addr));
        assert_eq!(result, "ip:192.168.1.1");
    }

    #[test]
    fn test_generate_rate_limit_key_unknown() {
        let result = generate_rate_limit_key(None, None);
        assert_eq!(result, "unknown");
    }

    #[tokio::test]
    async fn test_rate_limiter_allows_within_limit() {
        let config = RateLimitConfig {
            authenticated_limit: 5,
            unauthenticated_limit: 3,
            window_seconds: 60,
        };
        let layer = RateLimitLayer::new(config);
        let mut service = layer.layer(TestService);

        // Should allow requests within limit
        let _req = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .header(header::AUTHORIZATION, "Bearer user-123")
            .body(Body::empty())
            .unwrap();

        // Add ConnectInfo for the test
        let mut req_with_ext = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .header(header::AUTHORIZATION, "Bearer user-123")
            .body(Body::empty())
            .unwrap();
        req_with_ext.extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([192, 168, 1, 1], 8080))));

        let response = service.ready().await.unwrap().call(req_with_ext).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_rate_limiter_exceeds_unauthenticated_limit() {
        let config = RateLimitConfig {
            authenticated_limit: 100,
            unauthenticated_limit: 3,
            window_seconds: 60,
        };
        let store = Arc::new(RateLimiterStore::new(config));
        let layer = RateLimitLayer::with_store(store.clone());
        let mut service = layer.layer(TestService);

        let _req = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .body(Body::empty())
            .unwrap();

        let mut req_with_ext = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .body(Body::empty())
            .unwrap();
        req_with_ext.extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([10, 0, 0, 1], 9090))));

        // First 3 requests should succeed
        for _ in 0..3 {
            let mut req_clone = Request::builder()
                .method(Method::GET)
                .uri("/test")
                .body(Body::empty())
                .unwrap();
            req_clone.extensions_mut()
                .insert(ConnectInfo(SocketAddr::from(([10, 0, 0, 1], 9090))));
            let response = service.ready().await.unwrap().call(req_clone).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        // 4th request should be rate limited
        let response = service.ready().await.unwrap().call(req_with_ext).await.unwrap();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

        // Verify Retry-After header is present
        assert!(response.headers().get(header::RETRY_AFTER).is_some());
    }

    #[tokio::test]
    async fn test_rate_limiter_separate_counters_for_users() {
        let config = RateLimitConfig {
            authenticated_limit: 2,
            unauthenticated_limit: 100,
            window_seconds: 60,
        };
        let store = Arc::new(RateLimiterStore::new(config));
        let layer = RateLimitLayer::with_store(store.clone());

        // User 1 hits limit
        let mut service1 = layer.clone().layer(TestService.clone());

        // Make 2 requests for user 1
        for _ in 0..2 {
            let _req1 = Request::builder()
                .method(Method::GET)
                .uri("/test")
                .header(header::AUTHORIZATION, "Bearer user-1")
                .body(Body::empty())
                .unwrap();
            let mut req1_with_ext = Request::builder()
                .method(Method::GET)
                .uri("/test")
                .header(header::AUTHORIZATION, "Bearer user-1")
                .body(Body::empty())
                .unwrap();
            req1_with_ext.extensions_mut()
                .insert(ConnectInfo(SocketAddr::from(([192, 168, 1, 1], 8080))));
            let _ = service1.ready().await.unwrap().call(req1_with_ext).await.unwrap();
        }

        // 3rd request for user 1 should be rate limited
        let _req1 = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .header(header::AUTHORIZATION, "Bearer user-1")
            .body(Body::empty())
            .unwrap();
        let mut req1_with_ext = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .header(header::AUTHORIZATION, "Bearer user-1")
            .body(Body::empty())
            .unwrap();
        req1_with_ext.extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([192, 168, 1, 1], 8080))));
        let response = service1.ready().await.unwrap().call(req1_with_ext).await.unwrap();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

        // User 2 should still be able to make requests
        let mut service2 = layer.layer(TestService);
        let _req2 = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .header(header::AUTHORIZATION, "Bearer user-2")
            .body(Body::empty())
            .unwrap();
        let mut req2_with_ext = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .header(header::AUTHORIZATION, "Bearer user-2")
            .body(Body::empty())
            .unwrap();
        req2_with_ext.extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([192, 168, 1, 2], 8080))));

        let response = service2.ready().await.unwrap().call(req2_with_ext).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_rate_limiter_builder() {
        let layer = RateLimiterBuilder::new()
            .authenticated_limit(50)
            .unauthenticated_limit(20)
            .window_seconds(120)
            .build();

        assert_eq!(layer.store.config.authenticated_limit, 50);
        assert_eq!(layer.store.config.unauthenticated_limit, 20);
        assert_eq!(layer.store.config.window_seconds, 120);
    }
}
