/**
 * Business Listing Types
 *
 * Types for scraped business listing data from external sources.
 */

/**
 * Scraper source - the external platform to scrape from
 */
export type ScraperSource = "google-maps" | "yelp" | "facebook";

/**
 * Raw business listing data from a scraper source
 */
export interface RawBusinessListing {
  rawName: string;
  rawAddress: string;
  source: ScraperSource;
  rawMetadata?: Record<string, unknown>;
}

/**
 * Extracted business data after parsing
 */
export interface ExtractedBusinessData {
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    countryCode: string;
    fullAddress: string;
  };
  source: ScraperSource;
}

/**
 * Result from extracting business data
 */
export interface ExtractionResult {
  success: boolean;
  data?: ExtractedBusinessData;
  error?: string;
}

/**
 * Scraper interface for platform-specific extraction logic
 */
export interface BusinessScraper {
  source: ScraperSource;
  extract(listing: RawBusinessListing): ExtractionResult;
}
