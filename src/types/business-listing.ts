/**
 * Business Listing Types
 *
 * Raw and normalized data structures for business listings from various sources.
 */

/**
 * Scraper source enumeration
 */
export type ScraperSource = "google-maps" | "yelp" | "facebook";

/**
 * Raw business listing data
 */
export interface RawBusinessListing {
  source: ScraperSource;
  rawName: string;
  rawAddress: string;
  rawPhone?: string;
  rawWebsite?: string;
  rawRating?: number;
  rawReviewCount?: number;
  rawCategory?: string;
}

/**
 * Address components
 */
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  countryCode: string;
  fullAddress: string;
}

/**
 * Extracted business data (normalized)
 */
export interface ExtractedBusinessData {
  name: string;
  address: Address;
  source: ScraperSource;
}

/**
 * Extraction result
 */
export interface ExtractionResult {
  success: boolean;
  data?: ExtractedBusinessData;
  error?: string;
}

/**
 * Business scraper interface
 */
export interface BusinessScraper {
  source: ScraperSource;
  extract(listing: RawBusinessListing): ExtractionResult;
}
