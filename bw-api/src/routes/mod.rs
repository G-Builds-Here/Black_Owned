//! API routes module.

use axum::Router;

pub mod images;

/// Create the main router
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
}
