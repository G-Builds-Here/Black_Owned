//! GraphQL module for Black Owned API.
//!
//! Provides GraphQL schema with async-graphql for:
//! - Business, Review, Category types
//! - Queries: businesses, business, reviews, categories
//! - Mutations: createBusiness, createReview

pub mod mutations;
pub mod queries;
pub mod schema;
pub mod types;

#[cfg(test)]
mod tests;
