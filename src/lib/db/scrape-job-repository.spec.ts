/**
 * Scrape Job Repository Tests
 */

import {
  createScrapeJob,
  findScrapeJobById,
  findAllScrapeJobs,
  updateScrapeJobStatus,
  updateScrapeJobBusinessCount,
  initializeScrapeJobSchema,
} from "./scrape-job-repository";
import { CreateScrapeJobInput, ScraperSource, ScrapeJobStatus } from "../../types/scrape-job";
import { getPool } from "./user-repository";

describe("ScrapeJobRepository", () => {
  beforeAll(async () => {
    // Initialize schema before tests
    await initializeScrapeJobSchema();
  });

  afterAll(async () => {
    // Clean up all test data
    const client = await getPool().connect();
    try {
      // Delete all jobs created during tests (all sources used in tests)
      await client.query("DELETE FROM scrape_jobs WHERE source IN ('google-maps', 'yelp', 'facebook', 'test-cleanup')");
    } finally {
      client.release();
    }
  });

  describe("createScrapeJob", () => {
    it("should create a scrape job with valid input", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "black owned restaurants",
        location: "New York, NY",
      };

      const result = await createScrapeJob(input);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.source).toBe(input.source);
      expect(result.query).toBe(input.query);
      expect(result.location).toBe(input.location);
      expect(result.status).toBe("pending");
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it("should create a scrape job with yelp source", async () => {
      const input: CreateScrapeJobInput = {
        source: "yelp",
        query: "black owned cafes",
        location: "Los Angeles, CA",
      };

      const result = await createScrapeJob(input);

      expect(result.source).toBe("yelp");
      expect(result.status).toBe("pending");
    });

    it("should create a scrape job with facebook source", async () => {
      const input: CreateScrapeJobInput = {
        source: "facebook",
        query: "black owned businesses",
        location: "Chicago, IL",
      };

      const result = await createScrapeJob(input);

      expect(result.source).toBe("facebook");
      expect(result.status).toBe("pending");
    });

    it("should generate unique IDs for each job", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "test query",
        location: "test location",
      };

      const job1 = await createScrapeJob(input);
      const job2 = await createScrapeJob(input);

      expect(job1.id).not.toBe(job2.id);
    });
  });

  describe("findScrapeJobById", () => {
    it("should find a scrape job by ID", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "find test query",
        location: "find test location",
      };

      const created = await createScrapeJob(input);
      const found = await findScrapeJobById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.source).toBe(input.source);
    });

    it("should return null for non-existent ID", async () => {
      const result = await findScrapeJobById("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  describe("findAllScrapeJobs", () => {
    beforeEach(async () => {
      // Clean up all test data before each test
      const client = await getPool().connect();
      try {
        await client.query("DELETE FROM scrape_jobs WHERE source IN ('google-maps', 'yelp', 'facebook', 'test-cleanup')");
      } finally {
        client.release();
      }
    });

    it("should return empty list when no jobs exist", async () => {
      const result = await findAllScrapeJobs(1, 20);

      expect(result.jobs).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(0);
    });

    it("should return paginated results", async () => {
      // Create test jobs
      for (let i = 0; i < 5; i++) {
        await createScrapeJob({
          source: "test-cleanup" as ScraperSource,
          query: `test query ${i}`,
          location: "test location",
        });
      }

      const result = await findAllScrapeJobs(1, 2);

      expect(result.jobs.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.totalPages).toBe(3);
    });

    it("should filter by status", async () => {
      await createScrapeJob({
        source: "google-maps",
        query: "pending job",
        location: "location",
      });

      const pendingJob = await createScrapeJob({
        source: "yelp",
        query: "another job",
        location: "location",
      });
      await updateScrapeJobStatus(pendingJob.id, "running");

      const result = await findAllScrapeJobs(1, 20, "pending");

      expect(result.jobs.every((job) => job.status === "pending")).toBe(true);
    });

    it("should return results sorted by created_at descending", async () => {
      await createScrapeJob({
        source: "google-maps",
        query: "first job",
        location: "location",
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const secondJob = await createScrapeJob({
        source: "yelp",
        query: "second job",
        location: "location",
      });

      const result = await findAllScrapeJobs(1, 10);

      expect(result.jobs[0].id).toBe(secondJob.id);
    });
  });

  describe("updateScrapeJobStatus", () => {
    it("should update scrape job status", async () => {
      const job = await createScrapeJob({
        source: "google-maps",
        query: "status test",
        location: "location",
      });

      const updated = await updateScrapeJobStatus(job.id, "running");

      expect(updated?.status).toBe("running");
      expect(updated?.updated_at).toBeInstanceOf(Date);
    });

    it("should update status through all states", async () => {
      const job = await createScrapeJob({
        source: "google-maps",
        query: "state test",
        location: "location",
      });

      const running = await updateScrapeJobStatus(job.id, "running");
      const completed = await updateScrapeJobStatus(running!.id, "completed");
      const failed = await updateScrapeJobStatus(job.id, "failed");

      expect(running?.status).toBe("running");
      expect(completed?.status).toBe("completed");
      expect(failed?.status).toBe("failed");
    });

    it("should return null for non-existent ID", async () => {
      const result = await updateScrapeJobStatus(
        "00000000-0000-0000-0000-000000000000",
        "running"
      );
      expect(result).toBeNull();
    });
  });

  describe("updateScrapeJobBusinessCount", () => {
    it("should update business count", async () => {
      const job = await createScrapeJob({
        source: "google-maps",
        query: "count test",
        location: "location",
      });

      const updated = await updateScrapeJobBusinessCount(job.id, 42);

      expect(updated?.business_count).toBe(42);
    });

    it("should handle zero business count", async () => {
      const job = await createScrapeJob({
        source: "google-maps",
        query: "zero count test",
        location: "location",
      });

      const updated = await updateScrapeJobBusinessCount(job.id, 0);

      expect(updated?.business_count).toBe(0);
    });

    it("should return null for non-existent ID", async () => {
      const result = await updateScrapeJobBusinessCount(
        "00000000-0000-0000-0000-000000000000",
        10
      );
      expect(result).toBeNull();
    });
  });
});
