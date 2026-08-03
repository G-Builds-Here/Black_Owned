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
