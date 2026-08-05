/**
 * Scrape Job Types
 *
 * Defines data structures for job scraping operations.
 */

/**
 * Job scraping status
 */
export type ScrapeJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
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
  query: string;
  location: string;
}

/**
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
