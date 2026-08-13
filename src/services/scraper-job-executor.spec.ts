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

// Mock the scraper to avoid actual network calls
jest.mock("./business-scraper", () => ({
  getScraper: jest.fn().mockReturnValue({
    source: "google-maps",
    scrape: jest.fn().mockResolvedValue({
      businesses: [
        {
          name: "Test Business 1",
          address: "123 Test St, Test City, TX",
          phone: "(555) 123-4567",
          website: "https://test1.com",
          rating: 4.5,
          reviewCount: 100,
          source: "google-maps",
        },
        {
          name: "Test Business 2",
          address: "456 Test Ave, Test City, TX",
          phone: "(555) 987-6543",
          website: "https://test2.com",
          rating: 4.0,
          reviewCount: 50,
          source: "google-maps",
        },
      ],
      source: "google-maps",
      query: "test query",
      location: "Test City",
      timestamp: new Date(),
    }),
  }),
}));

describe("Scraper Job Executor - Integration (LOC-0073-AC1)", () => {
  const testPrefix = `scraperjob-exec-${Date.now()}`;
  let client: ReturnType<typeof getPool>["connect"];

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
        expect(job?.businessCount).toBe(2); // Mock returns 2 businesses
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

        expect(businesses.length).toBe(2);

        // Verify first business
        expect(businesses[0].name).toBe("Test Business 1");
        expect(businesses[0].address).toBe("123 Test St, Test City, TX");
        expect(businesses[0].source).toBe("google-maps");

        // Verify second business
        expect(businesses[1].name).toBe("Test Business 2");
        expect(businesses[1].address).toBe("456 Test Ave, Test City, TX");
        expect(businesses[1].source).toBe("google-maps");
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
        expect(result.businessCount).toBe(2);

        // Verify job has correct business count
        const job = await findScrapeJobById(client, result.jobId);
        expect(job?.businessCount).toBe(2);
      } finally {
        client.release();
      }
    });

    it("AC1: Handles scraper errors gracefully", async () => {
      // Mock scraper that throws an error
      jest.mock("./business-scraper", () => ({
        getScraper: jest.fn().mockReturnValue({
          source: "google-maps",
          scrape: jest.fn().mockRejectedValue(
            new Error("Network timeout")
          ),
        }),
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
      jest.mock("./business-scraper", () => ({
        getScraper: jest.fn().mockReturnValue({
          source: "google-maps",
          scrape: jest.fn().mockResolvedValue({
            businesses: [],
            source: "google-maps",
            query: "empty test",
            location: "Test City",
            timestamp: new Date(),
          }),
        }),
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

        expect(result.success).toBe(true);
        expect(result.finalStatus).toBe("completed");
        expect(result.businessCount).toBe(0);

        // Verify job is completed with zero businesses
        const job = await findScrapeJobById(client, result.jobId);
        expect(job?.status).toBe("completed");
        expect(job?.businessCount).toBe(0);
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
        await updateScrapeJobStatus(job.id, "completed", 5);

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
