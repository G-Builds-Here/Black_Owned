//! Data importer module
//!
//! Handles importing business data from various sources.

/// Data importer trait
pub trait Importer {
    /// Import data from source
    fn import(&self) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>>;
}

/// Placeholder importer implementation
pub struct PlaceholderImporter;

impl Importer for PlaceholderImporter {
    fn import(&self) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        Ok(vec![])
    }
}
