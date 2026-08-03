/**
 * Scrape Job Types
 *
<<<<<<< HEAD
 * Defines data structures for job scraping operations.
 */

/**
 * Job scraping status
=======
 * Types for managing web scraping jobs in the Black Owned directory.
 */

/**
 * Scraper source - the external platform to scrape from
 */
export type ScraperSource = "google-maps" | "yelp" | "facebook";

/**
 * Scrape job status - tracks the lifecycle of a scrape job
>>>>>>> feature/LOC-0059-AC1
 */
export type ScrapeJobStatus = "pending" | "running" | "completed" | "failed";

/**
<<<<<<< HEAD
 * ScrapeJob entity stored in PostgreSQL
 */
export interface ScrapeJob {
  id: string;
  source: string;
  query: string;
  location: string;
  status: ScrapeJobStatus;
  resultCount?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new scrape job
 */
export interface CreateScrapeJobInput {
  source: string;
=======
 * Input for creating a new scrape job
 */
export interface CreateScrapeJobInput {
  source: ScraperSource;
>>>>>>> feature/LOC-0059-AC1
  query: string;
  location: string;
}

/**
<<<<<<< HEAD
 * Validates scrape job input
 */
export function validateScrapeJobInput(input: CreateScrapeJobInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.source || input.source.trim() === "") {
    errors.push("Source is required");
  }

  if (!input.query || input.query.trim() === "") {
    errors.push("Query is required");
  }

  if (!input.location || input.location.trim() === "") {
    errors.push("Location is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates scrape job status
 */
export function isValidScrapeJobStatus(status: string): status is ScrapeJobStatus {
  const validStatuses: ScrapeJobStatus[] = ["pending", "running", "completed", "failed"];
  return validStatuses.includes(status as ScrapeJobStatus);
=======
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
>>>>>>> feature/LOC-0059-AC1
}
