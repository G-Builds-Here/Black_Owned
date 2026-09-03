/**
 * Scraper Job Executor Integration Tests
 *
 * AC: LOC-0073-AC1 - Complete scrape job flow with mock data
 *
 * Runs against the live PostgreSQL database. It is excluded from the default
 * jest run (see jest.config.js testPathIgnorePatterns); run it with:
 *   npx jest --forceExit "src/services/scraper-job-executor.spec.ts" --testPathIgnorePatterns "^$"
 *
 * Tests the complete job lifecycle:
 * - Job created with pending status
 * - Job transitions to running
 * - Scraper executes and returns results
 * - Scraped data is stored in database
 * - Job transitions to completed with business count
 * - Cancelled jobs are terminal and can never be overwritten
 */

import { getPool } from "../lib/db/user-repository";
import {
  createScrapeJob,
  findScrapeJobById,
  updateScrapeJobStatus,
  cancelScrapeJob,
} from "../lib/db/scrape-job-repository";
import {
  findScrapedBusinessesByJobId,
} from "../lib/db/scraped-business-repository";
import { executeScrapeJob, executeScrapeJobById } from "./scraper-job-executor";
import { CreateScrapeJobInput } from "../types/scrape-job";

// Mock the scraper to avoid actual network calls. The scrape implementation
// is controlled per test through mockScrape, and the available sources are
// controlled through mockedScraper.getAvailableSources.
jest.mock("./business-scraper", () => ({
  getScraper: jest.fn(),
  getAvailableSources: jest.fn(),
}));

const mockedScraper = jest.requireMock("./business-scraper") as {
  getScraper: jest.Mock;
  getAvailableSources: jest.Mock;
};

const mockScrape = jest.fn();

describe("Scraper Job Executor - Integration (LOC-0073-AC1)", () => {
  const testPrefix = `scraperjob-exec-${Date.now()}`;
  let client: ReturnType<typeof getPool>["connect"];

  function defaultScrapeResult() {
    return {
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
    };
  }

  async function cleanup(): Promise<void> {
    client = await getPool().connect();
    try {
      // Clean up test jobs (every test query carries the unique prefix)
      await client.query(
        "DELETE FROM scrape_jobs WHERE query LIKE $1",
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

  beforeEach(() => {
    mockScrape.mockReset();
    mockScrape.mockResolvedValue(defaultScrapeResult());
    mockedScraper.getScraper.mockReturnValue({
      source: "google-maps",
      scrape: mockScrape,
    });
    mockedScraper.getAvailableSources.mockReturnValue([
      "google-maps",
      "yelp",
      "facebook",
    ]);
  });

  describe("executeScrapeJob - Complete Flow", () => {
    it("AC1: Creates job with pending status", async () => {
      client = await getPool().connect();
      try {

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-pending`,
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

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-transition`,
          location: "Test City",
        };

        // Execute the full flow
        const result = await executeScrapeJob(client, input);

        // Verify job was created and completed
        expect(result.success).toBe(true);
        expect(result.finalStatus).toBe("completed");
        expect(result.jobId).toBeDefined();

        // Verify job is in database with completed status
        const job = await findScrapeJobById(client, result.jobId!);
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

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-stored`,
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(true);

        // Verify businesses were stored
        const businesses = await findScrapedBusinessesByJobId(
          client,
          result.jobId!
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

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-count`,
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(true);
        expect(result.businessCount).toBe(2);

        // Verify job has correct business count
        const job = await findScrapeJobById(client, result.jobId!);
        expect(job?.businessCount).toBe(2);
      } finally {
        client.release();
      }
    });

    it("AC1: Handles scraper errors gracefully", async () => {
      // Scraper rejects: the job must be marked failed in the database
      mockScrape.mockRejectedValue(new Error("Network timeout"));

      client = await getPool().connect();
      try {

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-error`,
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(false);
        expect(result.finalStatus).toBe("failed");
        expect(result.error).toContain("Network timeout");

        // Verify job is marked as failed
        const job = await findScrapeJobById(client, result.jobId!);
        expect(job?.status).toBe("failed");
        expect(job?.errorMessage).toContain("Network timeout");
      } finally {
        client.release();
      }
    });

    it("AC1: Empty results handled correctly", async () => {
      // Scraper returns empty results
      mockScrape.mockResolvedValue({
        businesses: [],
        source: "google-maps",
        query: "empty test",
        location: "Test City",
        timestamp: new Date(),
      });

      client = await getPool().connect();
      try {

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-empty`,
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(true);
        expect(result.finalStatus).toBe("completed");
        expect(result.businessCount).toBe(0);

        // Verify job is completed with zero businesses
        const job = await findScrapeJobById(client, result.jobId!);
        expect(job?.status).toBe("completed");
        expect(job?.businessCount).toBe(0);
      } finally {
        client.release();
      }
    });

    it("leaves the job failed in the database for an invalid source", async () => {
      mockedScraper.getAvailableSources.mockReturnValue(["google-maps"]);

      client = await getPool().connect();
      try {

        const input = {
          source: `${testPrefix}-invalid-source`,
          query: `${testPrefix}-invalid`,
          location: "Test City",
        } as unknown as CreateScrapeJobInput;

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(false);
        expect(result.finalStatus).toBe("failed");
        expect(result.error).toContain("Invalid source");
        expect(mockScrape).not.toHaveBeenCalled();

        // The job must not be left stuck in running
        const job = await findScrapeJobById(client, result.jobId!);
        expect(job?.status).toBe("failed");
        expect(job?.errorMessage).toContain("Invalid source");
      } finally {
        client.release();
      }
    });
  });

  describe("Cancellation semantics", () => {
    it("never overwrites a cancelled job (repository guard)", async () => {
      client = await getPool().connect();
      try {

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-cancel-guard`,
          location: "Test City",
        };
        const job = await createScrapeJob(client, input);
        await updateScrapeJobStatus(client, job.id, "running");

        const cancelled = await cancelScrapeJob(job.id);
        expect(cancelled?.status).toBe("cancelled");

        // A late completion must be a no-op
        const lateUpdate = await updateScrapeJobStatus(
          client,
          job.id,
          "completed",
          5
        );
        expect(lateUpdate).toBeUndefined();

        const current = await findScrapeJobById(client, job.id);
        expect(current?.status).toBe("cancelled");
      } finally {
        client.release();
      }
    });

    it("returns cancelled when the job is cancelled while the scraper is running", async () => {
      const uniqueQuery = `${testPrefix}-cancelled-during`;
      // The scraper cancels the job (by looking it up via its unique query)
      // before it resolves, simulating a user-initiated cancel mid-scrape.
      mockScrape.mockImplementation(async () => {
        const cancelClient = await getPool().connect();
        try {
          const found = await cancelClient.query(
            "SELECT id FROM scrape_jobs WHERE query = $1",
            [uniqueQuery]
          );
          await cancelScrapeJob(found.rows[0].id);
        } finally {
          cancelClient.release();
        }
        return {
          businesses: [],
          source: "google-maps",
          query: uniqueQuery,
          location: "Test City",
          timestamp: new Date(),
        };
      });

      client = await getPool().connect();
      try {

        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: uniqueQuery,
          location: "Test City",
        };

        const result = await executeScrapeJob(client, input);

        expect(result.success).toBe(false);
        expect(result.finalStatus).toBe("cancelled");
        expect(result.jobId).toBeDefined();
        expect(mockScrape).toHaveBeenCalled();

        const job = await findScrapeJobById(client, result.jobId!);
        expect(job?.status).toBe("cancelled");
      } finally {
        client.release();
      }
    });
  });

  describe("executeScrapeJobById", () => {
    it("executes a pending job by ID", async () => {
      client = await getPool().connect();
      try {

        // Create a pending job
        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-byid`,
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

        // Create and complete a job
        const input: CreateScrapeJobInput = {
          source: "google-maps",
          query: `${testPrefix}-notpending`,
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
