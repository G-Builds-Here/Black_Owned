//! GraphQL schema configuration for Black Owned API.
//!
//! Sets up the async-graphql schema with all types, queries, and mutations.

use async_graphql::*;

use super::mutations::MutationRoot;
use super::queries::QueryRoot;

/// Main GraphQL schema type
pub type Schema = async_graphql::Schema<QueryRoot, MutationRoot, EmptySubscription>;

/// Create a new GraphQL schema instance
pub fn create_schema() -> Schema {
    Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .finish()
}
