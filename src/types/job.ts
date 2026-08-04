/**
 * Job Management Types
 *
 * Defines types for job scraping and management.
 */

/**
 * Job status values
 */
export type JobStatus = 'pending' | 'scraping' | 'completed' | 'failed';

/**
 * Job record structure
 */
export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  description?: string;
  url: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
  scrapedAt?: Date;
}

/**
 * Input for creating a job
 */
export interface CreateJobInput {
  title: string;
  company: string;
  location: string;
  description?: string;
  url: string;
}

/**
 * Result from job scraping operation
 */
export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
}

/**
 * Validate job status
 */
export function isValidJobStatus(status: string): status is JobStatus {
  return ['pending', 'scraping', 'completed', 'failed'].includes(status);
}
