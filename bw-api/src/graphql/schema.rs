//! GraphQL schema definition.

use async_graphql::{EmptySubscription, Schema, SchemaBuilder};
use crate::graphql::mutations::Mutation;
use crate::graphql::queries::Query;

/// Create the GraphQL schema
pub fn create_schema() -> Schema<Query, Mutation, EmptySubscription> {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription)
        .finish()
}

/// Schema builder for testing
pub fn create_schema_builder() -> SchemaBuilder<Query, Mutation, EmptySubscription> {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription)
}
