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
export type ScrapeJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

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

/**
 * Validation result for scrape job input
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates scrape job input
 */
export function validateScrapeJobInput(input: CreateScrapeJobInput): ValidationResult {
  const errors: string[] = [];

  // Validate source
  const validSources: ScraperSource[] = ["google-maps", "yelp", "facebook"];
  if (!validSources.includes(input.source)) {
    errors.push(`Invalid source. Must be one of: ${validSources.join(", ")}`);
  }

  // Validate query
  if (!input.query || input.query.trim() === "") {
    errors.push("Missing required field: query");
  }

  // Validate location
  if (!input.location || input.location.trim() === "") {
    errors.push("Missing required field: location");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a default scrape job with pending status
 */
export function createDefaultScrapeJob(input: CreateScrapeJobInput): ScrapeJob {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    source: input.source,
    query: input.query,
    location: input.location,
    status: "pending",
    business_count: 0,
    created_at: now,
    updated_at: now,
  };
}
