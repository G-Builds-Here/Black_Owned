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
 * Valid scrape job status values
 */
const VALID_STATUSES: ScrapeJobStatus[] = ["pending", "running", "completed", "failed", "cancelled"];

/**
 * Status transition map - defines allowed transitions from each status
 */
const STATUS_TRANSITIONS: Record<ScrapeJobStatus, ScrapeJobStatus[]> = {
  pending: ["running"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * Check if a status value is valid
 */
export function isValidScrapeJobStatus(status: string): status is ScrapeJobStatus {
  return VALID_STATUSES.includes(status as ScrapeJobStatus);
}

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  from: ScrapeJobStatus,
  to: ScrapeJobStatus
): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Get allowed transitions for a given status
 */
export function getAllowedTransitions(status: ScrapeJobStatus): ScrapeJobStatus[] {
  return STATUS_TRANSITIONS[status] || [];
}
