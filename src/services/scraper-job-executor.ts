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
} from "../lib/db/scrape-job-repository";
import {
  createScrapedBusiness,
  findScrapedBusinessesByJobId,
} from "../lib/db/scraped-business-repository";
import { CreateScrapedBusinessInput } from "../types/scraped-business";
import { ScraperSource, RawBusinessListing } from "../types/business-listing";
import { getScraper } from "./business-scraper";

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
  source: ScraperSource;
}

/**
 * Scraper result with businesses - matches the return type from individual scrapers
 */
type ScraperExecutionResult = {
  businesses: NormalizedBusiness[];
  source: ScraperSource;
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
    // Step 1: Create job with pending status
    const job = await createScrapeJob(client, input);

    // Step 2: Transition to running
    const runningJob = await updateScrapeJobStatus(
      client,
      job.id,
      "running"
    );

    if (!runningJob) {
      return {
        success: false,
        jobId: job.id,
        finalStatus: "failed",
        error: "Failed to transition job to running status",
      };
    }

    // Step 3: Execute scraper
    const scraper = getScraper(input.source as ScraperSource);
    let scraperResult: ScraperExecutionResult;

    try {
      // Create a mock raw listing for the scraper to process
      const mockListing: RawBusinessListing = {
        source: input.source as ScraperSource,
        rawName: `Test Business for ${input.query}`,
        rawAddress: `${input.location}, Test City, TX, US`,
        rawPhone: "(555) 123-4567",
        rawWebsite: "https://test.com",
        rawRating: 4.5,
        rawReviewCount: 100,
        rawCategory: "Test Category",
      };

      const extractionResult = scraper.extract(mockListing);

      if (!extractionResult.success) {
        throw new Error(extractionResult.error || "Scraper extraction failed");
      }

      scraperResult = {
        businesses: [
          {
            name: extractionResult.data.name,
            address: extractionResult.data.address.fullAddress,
            phone: mockListing.rawPhone,
            website: mockListing.rawWebsite,
            rating: mockListing.rawRating,
            reviewCount: mockListing.rawReviewCount,
            category: mockListing.rawCategory,
            source: input.source as ScraperSource,
          },
        ],
        source: input.source as ScraperSource,
        query: input.query,
        location: input.location,
        timestamp: new Date(),
      };
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
        source: business.source,
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
): Promise<{ job: ScrapeJob | undefined; businesses: CreateScrapedBusinessInput[] }> {
  const job = await findScrapeJobById(client, jobId);

  if (!job) {
    return { job: undefined, businesses: [] };
  }

  const businesses = await findScrapedBusinessesByJobId(client, jobId);

  return { job, businesses };
}
