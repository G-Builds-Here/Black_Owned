/**
 * Scraper Job Executor Integration Tests
 *
 * AC: LOC-0073-AC1 - Complete scrape job flow with mock data
 *
 * Tests the complete job lifecycle:
 * - Job created with pending status
 * - Job transitions to running
 * - Scraper executes and returns results
 * - Scraped data is stored in database
 * - Job transitions to completed with business count
 */

import { getPool } from "../lib/db/user-repository";
import { PoolClient } from "pg";
import {
  initializeScrapeJobSchema,
  createScrapeJob,
  findScrapeJobById,
  updateScrapeJobStatus,
} from "../lib/db/scrape-job-repository";
import {
  initializeScrapedBusinessSchema,
  findScrapedBusinessesByJobId,
} from "../lib/db/scraped-business-repository";
import { executeScrapeJob, executeScrapeJobById } from "./scraper-job-executor";
import { CreateScrapeJobInput } from "../types/scrape-job";
import { ScraperSource, RawBusinessListing, ExtractionResult, BusinessScraper } from "../types/business-listing";

// Mock the scraper to avoid actual network calls
jest.mock("./business-scraper", () => {
  const mockScraper = {
    source: "google-maps" as ScraperSource,
    extract: jest.fn().mockReturnValue({
      success: true,
      data: {
        name: "Test Business 1",
        address: {
          street: "123 Test St",
          city: "Test City",
          state: "TX",
          zipCode: "75001",
          countryCode: "US",
          fullAddress: "123 Test St, Test City, TX, US",
        },
        source: "google-maps" as ScraperSource,
      },
    }),
  };

  return {
    getScraper: jest.fn().mockReturnValue(mockScraper),
  };
});

describe("Scraper Job Executor - Integration (LOC-0073-AC1)", () => {
  const testPrefix = `scraperjob-exec-${Date.now()}`;
  let client: PoolClient;

  async function cleanup(): Promise<void> {
    client = await getPool().connect();
    try {
      // Clean up test jobs
      await client.query(
        "DELETE FROM scrape_jobs WHERE source LIKE $1",
        [`%${testPrefix}%`]
      );
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  describe("executeScrapeJob - Complete Flow", () => {
    it("AC1: Creates job with pending status", async () => {
      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-pending`,
          query: "pending test",
          location: "Test City",
        };

        // Just create the job without executing
        const job = await createScrapeJob(client, input);

        expect(job.id).toBeDefined();
        expect(job.status).toBe("pending");
      } finally {
        client.release();
      }
    });

    it("AC1: Job transitions from pending to running to completed", async () => {
      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-transition`,
          query: "transition test",
          location: "Test City",
        };

        // Execute the full flow
        const result = await executeScrapeJob(client, input);

        // Verify job was created and completed
        expect(result.success).toBe(true);
        expect(result.finalStatus).toBe("completed");
        expect(result.jobId).toBeDefined();

        // Verify job is in database with completed status
        const job = await findScrapeJobById(client, result.jobId);
        expect(job).toBeDefined();
        expect(job?.status).toBe("completed");
        expect(job?.resultCount).toBe(1); // Mock returns 1 business
      } finally {
        client.release();
      }
    });

    it("AC1: Scraped data is stored in database", async () => {
      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);
        await initializeScrapedBusinessSchema(client);

        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-stored`,
          query: "stored test",
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(true);

        // Verify businesses were stored
        const businesses = await findScrapedBusinessesByJobId(
          client,
          result.jobId
        );

        expect(businesses.length).toBe(1);

        // Verify first business
        expect(businesses[0].name).toBe("Test Business for stored test");
        expect(businesses[0].source).toBe("google-maps");
      } finally {
        client.release();
      }
    });

    it("AC1: Job business count matches stored businesses", async () => {
      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);
        await initializeScrapedBusinessSchema(client);

        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-count`,
          query: "count test",
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(true);
        expect(result.businessCount).toBe(1);

        // Verify job has correct business count
        const job = await findScrapeJobById(client, result.jobId);
        expect(job?.resultCount).toBe(1);
      } finally {
        client.release();
      }
    });

    it("AC1: Handles scraper errors gracefully", async () => {
      // Mock scraper that throws an error
      const mockScraperWithError = {
        source: "google-maps" as ScraperSource,
        extract: jest.fn().mockReturnValue({
          success: false,
          error: "Network timeout",
        }),
      };

      jest.mock("./business-scraper", () => ({
        getScraper: jest.fn().mockReturnValue(mockScraperWithError),
      }));

      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-error`,
          query: "error test",
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(false);
        expect(result.finalStatus).toBe("failed");
        expect(result.error).toContain("Network timeout");

        // Verify job is marked as failed
        const job = await findScrapeJobById(client, result.jobId);
        expect(job?.status).toBe("failed");
        expect(job?.errorMessage).toContain("Network timeout");
      } finally {
        client.release();
      }
    });

    it("AC1: Empty results handled correctly", async () => {
      // Mock scraper that returns empty results
      const mockScraperWithEmpty = {
        source: "google-maps" as ScraperSource,
        extract: jest.fn().mockReturnValue({
          success: true,
          data: {
            name: "",
            address: {
              street: "",
              city: "",
              state: "",
              zipCode: "",
              countryCode: "US",
              fullAddress: "",
            },
            source: "google-maps" as ScraperSource,
          },
        }),
      };

      jest.mock("./business-scraper", () => ({
        getScraper: jest.fn().mockReturnValue(mockScraperWithEmpty),
      }));

      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-empty`,
          query: "empty test",
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        // Empty name should cause failure
        expect(result.success).toBe(false);
        expect(result.finalStatus).toBe("failed");
      } finally {
        client.release();
      }
    });
  });

  describe("executeScrapeJobById", () => {
    it("executes a pending job by ID", async () => {
      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        // Create a pending job
        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-byid`,
          query: "by id test",
          location: "Test City",
        };

        const job = await createScrapeJob(client, input);

        // Execute by ID
        const result = await executeScrapeJobById(client, job.id);

        expect(result.success).toBe(true);
        expect(result.finalStatus).toBe("completed");
      } finally {
        client.release();
      }
    });

    it("fails for non-pending jobs", async () => {
      client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        // Create and complete a job
        const input: CreateScrapeJobInput = {
          source: `${testPrefix}-notpending`,
          query: "not pending test",
          location: "Test City",
        };

        const job = await createScrapeJob(client, input);
        await updateScrapeJobStatus(client, job.id, "completed", 5);

        // Try to execute already completed job
        const result = await executeScrapeJobById(client, job.id);

        expect(result.success).toBe(false);
        expect(result.finalStatus).toBe("completed");
        expect(result.error).toContain("Only pending jobs can be executed");
      } finally {
        client.release();
      }
    });

    it("fails for non-existent job", async () => {
      client = await getPool().connect();
      try {
        const result = await executeScrapeJobById(
          client,
          "00000000-0000-0000-0000-000000000000"
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("Job not found");
      } finally {
        client.release();
      }
    });
  });
});
