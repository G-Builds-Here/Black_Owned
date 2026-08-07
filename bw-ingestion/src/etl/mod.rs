//! ETL Pipeline for transforming scraped data into normalized Business records.

pub mod transformer;
pub mod yelp;
pub mod google_maps;
pub mod facebook;
pub mod pipeline;

pub use transformer::RawBusinessData;

use crate::Business;
use anyhow::Result;

/// Trait for transforming raw source data into Business records.
pub trait Transformer: Send + Sync {
    /// Transform raw JSON data into a Business record.
    fn transform(&self, raw_data: &serde_json::Value) -> Result<Business>;

    /// Get the source type this transformer handles.
    fn source_type(&self) -> &'static str;
}
