/**
 * Scrape Job Types
 *
 * Types for managing web scraping jobs in the Black Owned directory.
 */

/**
 * Scraper source - the external platform to scrape from
 */
export type ScraperSource = "google-maps" | "yelp" | "facebook";

/**
 * Extracted business metadata from scraper
 */
export interface ExtractedBusinessMetadata {
  name: string;
  category: string;
  rating: number;
  review_count: number;
  address?: string;
  phone?: string;
  website?: string;
}

/**
 * Scrape job status - tracks the lifecycle of a scrape job
 */
export type ScrapeJobStatus = "pending" | "running" | "completed" | "failed";

/**
 * Input for creating a new scrape job
 */
export interface CreateScrapeJobInput {
  source: ScraperSource;
  query: string;
  location: string;
}

/**
 * Scrape job entity stored in the database
 */
export interface ScrapeJob {
  id: string;
  source: ScraperSource;
  query: string;
  location: string;
  status: ScrapeJobStatus;
  business_count: number;
  extracted_metadata: ExtractedBusinessMetadata[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Result from creating a scrape job
 */
export interface CreateScrapeJobResult {
  id: string;
  source: ScraperSource;
  query: string;
  location: string;
  status: "pending";
  created_at: Date;
}

/**
 * Validation error for scrape job creation
 */
export interface ScrapeJobValidationError {
  field: string;
  message: string;
}
