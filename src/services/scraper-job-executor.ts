/**
 * Scraper Job Executor
 *
 * Orchestrates the complete scrape job flow:
 * pending -> running -> scraping -> storing results -> completed
 */

import { PoolClient } from "pg";
import {
  ScrapeJob,
  ScrapeJobStatus,
  CreateScrapeJobInput,
} from "../types/scrape-job";
import {
  createScrapeJob,
  findScrapeJobById,
  updateScrapeJobStatus,
  findScrapeJobs,
} from "../lib/db/scrape-job-repository";
import {
  createScrapedBusiness,
  findScrapedBusinessesByJobId,
} from "../lib/db/scraped-business-repository";
import type { CreateScrapedBusinessInput } from "../lib/db/scraped-business-repository";
import { ScraperSource } from "../types/scraper-result";
import { getScraper, getAvailableSources } from "./business-scraper";

/**
 * Result of executing a scrape job
 */
export interface ScraperJobExecutionResult {
  success: boolean;
  jobId: string;
  finalStatus: ScrapeJobStatus;
  businessCount?: number;
  error?: string;
}

/**
 * Business data from scraper (normalized from source-specific formats)
 */
interface NormalizedBusiness {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  source: "google-maps" | "yelp" | "facebook";
}

/**
 * Scraper result with businesses - matches the return type from individual scrapers
 */
type ScraperExecutionResult = {
  businesses: NormalizedBusiness[];
  source: "google-maps" | "yelp" | "facebook";
  query: string;
  location: string;
  timestamp: Date;
};

/**
 * Executes a scrape job through its complete lifecycle
 * @param client - PostgreSQL pool client for transaction support
 * @param input - Scrape job creation input
 * @returns Execution result with final status
 */
export async function executeScrapeJob(
  client: PoolClient,
  input: CreateScrapeJobInput
): Promise<ScraperJobExecutionResult> {
  try {
    // Check for existing non-pending jobs with the same input
    const existingJobs = await findScrapeJobs(client, undefined, 10);
    const matchingNonPendingJob = existingJobs.find(
      job =>
        job.source === input.source &&
        job.query === input.query &&
        job.location === input.location &&
        job.status !== "pending"
    );

    if (matchingNonPendingJob) {
      return {
        success: false,
        jobId: matchingNonPendingJob.id,
        finalStatus: matchingNonPendingJob.status,
        error: "Only pending jobs can be executed",
      };
    }

    // Step 1: Create job with pending status
    const job = await createScrapeJob(client, input);

    // Step 2: Transition to running
    const runningJob = await updateScrapeJobStatus(
      client,
      job.id,
      "running",
      0
    );

    if (!runningJob) {
      return {
        success: false,
        jobId: job.id,
        finalStatus: "failed",
        error: "Failed to transition job to running status",
      };
    }

    // Step 3: Validate source before getting scraper
    const validSources = getAvailableSources();
    if (!validSources.includes(input.source as any)) {
      return {
        success: false,
        jobId: job.id,
        finalStatus: "failed",
        error: `Invalid source: ${input.source}. Valid sources are: ${validSources.join(", ")}`,
      };
    }

    let scraper: ReturnType<typeof getScraper>;
    let scraperResult: ScraperExecutionResult;

    try {
      scraper = getScraper(input.source as ScraperSource);
      scraperResult = await scraper.scrape(input.query, input.location) as ScraperExecutionResult;
    } catch (scraperError) {
      // Step 4a: Mark as failed on scraper error
      const failedJob = await updateScrapeJobStatus(
        client,
        job.id,
        "failed",
        undefined,
        scraperError instanceof Error ? scraperError.message : "Scraper execution failed"
      );

      return {
        success: false,
        jobId: job.id,
        finalStatus: "failed",
        error: scraperError instanceof Error ? scraperError.message : "Scraper execution failed",
      };
    }

    // Step 4b: Store scraped businesses in database
    const businesses = scraperResult.businesses;
    for (const business of businesses) {
      await createScrapedBusiness(client, {
        scrapeJobId: job.id,
        source: business.source as import("../types/scraper-result").ScraperSource,
        name: business.name,
        address: business.address,
        phone: business.phone,
        website: business.website,
        category: business.category,
        rating: business.rating,
        reviewCount: business.reviewCount,
      });
    }

    // Step 5: Update job with business count and mark as completed
    console.log(`Scraper found ${businesses.length} businesses`);
    const completedJob = await updateScrapeJobStatus(
      client,
      job.id,
      "completed",
      businesses.length
    );

    if (!completedJob) {
      return {
        success: false,
        jobId: job.id,
        finalStatus: "failed",
        error: "Failed to update job to completed status",
      };
    }

    return {
      success: true,
      jobId: job.id,
      finalStatus: "completed",
      businessCount: businesses.length,
    };
  } catch (error) {
    return {
      success: false,
      jobId: input.source + "-" + Date.now(),
      finalStatus: "failed",
      error: error instanceof Error ? error.message : "Unknown error during job execution",
    };
  }
}

/**
 * Executes a scrape job by ID (for re-running existing jobs)
 * @param client - PostgreSQL pool client
 * @param jobId - ID of the job to execute
 * @returns Execution result
 */
export async function executeScrapeJobById(
  client: PoolClient,
  jobId: string
): Promise<ScraperJobExecutionResult> {
  const job = await findScrapeJobById(client, jobId);

  if (!job) {
    return {
      success: false,
      jobId,
      finalStatus: "failed",
      error: "Job not found",
    };
  }

  if (job.status !== "pending") {
    return {
      success: false,
      jobId,
      finalStatus: job.status,
      error: `Cannot execute job in ${job.status} status. Only pending jobs can be executed.`,
    };
  }

  return executeScrapeJob(client, {
    source: job.source,
    query: job.query,
    location: job.location,
  });
}

/**
 * Gets the current state of a scrape job including its scraped businesses
 * @param client - PostgreSQL pool client
 * @param jobId - Job ID to retrieve
 * @returns Job with associated businesses
 */
export async function getScrapeJobWithBusinesses(
  client: PoolClient,
  jobId: string
): Promise<{ job: ScrapeJob | null; businesses: CreateScrapedBusinessInput[] }> {
  const job = await findScrapeJobById(client, jobId);

  if (!job) {
    return { job: null, businesses: [] };
  }

  const businesses = await findScrapedBusinessesByJobId(client, jobId);

  return { job, businesses };
}
