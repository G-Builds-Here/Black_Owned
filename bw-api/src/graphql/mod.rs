//! GraphQL module for Black Owned API.
//!
//! Provides GraphQL schema with Hot Chocolate (async-graphql) for:
//! - Business, Review, Category, User types
//! - Queries: businesses, business, reviews, categories, search
//! - Mutations: createBusiness, updateBusiness, submitReview, deleteReview

pub mod mutations;
pub mod queries;
pub mod schema;
pub mod types;

#[cfg(test)]
mod tests;
