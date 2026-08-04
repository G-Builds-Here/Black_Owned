/**
 * Scrape Job Types
 *
 * Defines the data structures for web scraping jobs.
 */

/**
 * Status of a scrape job
 */
export type ScrapeJobStatus = "Pending" | "Running" | "Completed" | "Failed" | "Cancelled";

/**
 * Scrape job entity stored in PostgreSQL
 */
export interface ScrapeJob {
  id: string;
  source: string;
  query: string;
  location: string;
  status: ScrapeJobStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a new scrape job with default values
 */
export function createScrapeJob(
  id: string,
  source: string,
  query: string,
  location: string
): ScrapeJob {
  const now = new Date();
  return {
    id,
    source,
    query,
    location,
    status: "Pending",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates the status of a scrape job
 */
export function updateScrapeJobStatus(
  job: ScrapeJob,
  status: ScrapeJobStatus
): ScrapeJob {
  return {
    ...job,
    status,
    updatedAt: new Date(),
  };
}

/**
 * Validates that a status value is a valid ScrapeJobStatus
 */
export function isValidScrapeJobStatus(status: string): status is ScrapeJobStatus {
  const validStatuses: ScrapeJobStatus[] = ["Pending", "Running", "Completed", "Failed", "Cancelled"];
  return validStatuses.includes(status as ScrapeJobStatus);
}
