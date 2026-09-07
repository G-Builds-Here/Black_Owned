//! GraphQL schema configuration for Black Owned API.
//!
//! Sets up the async-graphql schema with all types, queries, and mutations.

use async_graphql::*;
use sqlx::PgPool;

use super::mutations::MutationRoot;
use super::queries::QueryRoot;

/// Main GraphQL schema type
pub type Schema = async_graphql::Schema<QueryRoot, MutationRoot, EmptySubscription>;

/// Create a new GraphQL schema instance with database pool
pub fn create_schema(db_pool: PgPool) -> Schema {
    Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(db_pool)
        .finish()
}
