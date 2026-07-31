//! Authentication middleware for extracting user ID from JWT tokens.

use axum::{
    body::Body,
    extract::Extension,
    http::{Request, StatusCode, header},
    response::Response,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_layer::Layer;
use tokio::sync::RwLock;

/// User ID extracted from JWT token
#[derive(Debug, Clone)]
pub struct UserId(pub String);

/// Authentication configuration
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// JWT secret for token verification
    pub jwt_secret: String,
}

/// In-memory store for authenticated user sessions
pub struct AuthStore {
    /// Map of valid tokens to user IDs
    valid_tokens: std::sync::Arc<RwLock<std::collections::HashMap<String, String>>>,
}

impl Clone for AuthStore {
    fn clone(&self) -> Self {
        Self {
            valid_tokens: std::sync::Arc::clone(&self.valid_tokens),
        }
    }
}

impl std::fmt::Debug for AuthStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthStore").finish()
    }
}

impl AuthStore {
    fn new() -> Self {
        Self {
            valid_tokens: std::sync::Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }
}

/// Authentication middleware layer
#[derive(Clone)]
pub struct AuthLayer {
    store: Arc<AuthStore>,
    config: AuthConfig,
}

impl AuthLayer {
    pub fn new(config: AuthConfig) -> Self {
        Self {
            store: Arc::new(AuthStore::new()),
            config,
        }
    }
}

impl<S> Layer<S> for AuthLayer {
    type Service = AuthMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        AuthMiddleware {
            inner,
            store: self.store.clone(),
            config: self.config.clone(),
        }
    }
}

/// Authentication middleware service
pub struct AuthMiddleware<S> {
    inner: S,
    store: Arc<AuthStore>,
    config: AuthConfig,
}

impl<S> tower::Service<Request<Body>> for AuthMiddleware<S>
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

    fn call(&mut self, mut req: Request<Body>) -> Self::Future {
        let config = self.config.clone();
        let mut inner = self.inner.clone();

        // Extract token and user ID before async block to avoid borrow issues
        let token_info: Option<(String, String)> = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .and_then(|auth| auth.strip_prefix("Bearer "))
            .and_then(|token_str| {
                // Try to decode JWT and extract user ID
                use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
                use serde::{Deserialize, Serialize};

                #[derive(Debug, Deserialize, Serialize)]
                struct JwtClaims {
                    userId: String,
                    email: String,
                }

                let validation = Validation::new(Algorithm::HS256);
                decode::<JwtClaims>(
                    token_str,
                    &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
                    &validation,
                )
                .ok()
                .map(|token_data| (token_str.to_string(), token_data.claims.userId))
            });

        Box::pin(async move {
            if let Some((_, user_id)) = token_info {
                // Add user ID to request extensions
                req.extensions_mut().insert(UserId(user_id));
                inner.call(req).await
            } else {
                // Invalid or missing auth header - return 401
                let mut response = Response::new(Body::from("Unauthorized"));
                *response.status_mut() = StatusCode::UNAUTHORIZED;
                Ok(response)
            }
        })
    }
}

/// Builder for authentication middleware
pub struct AuthLayerBuilder {
    jwt_secret: Option<String>,
}

impl AuthLayerBuilder {
    pub fn new() -> Self {
        Self { jwt_secret: None }
    }

    pub fn jwt_secret(mut self, secret: String) -> Self {
        self.jwt_secret = Some(secret);
        self
    }

    pub fn build(self) -> Option<AuthLayer> {
        let secret = self.jwt_secret?;
        Some(AuthLayer::new(AuthConfig { jwt_secret: secret }))
    }
}

impl Default for AuthLayerBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{http::Method, response::Response};
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
    fn test_auth_layer_builder() {
        let layer = AuthLayerBuilder::new()
            .jwt_secret("test-secret".to_string())
            .build();
        assert!(layer.is_some());
    }

    #[test]
    fn test_auth_layer_builder_no_secret() {
        let layer = AuthLayerBuilder::new().build();
        assert!(layer.is_none());
    }
}
