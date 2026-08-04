/**
 * Scrape Job Repository Unit Tests
 */

import { getPool } from "./user-repository";
import {
  initializeScrapeJobSchema,
  createScrapeJob,
  findScrapeJobById,
  updateScrapeJobStatus,
  findScrapeJobs,
  deleteScrapeJob,
} from "./scrape-job-repository";
import { ScrapeJobStatus } from "../../types/scrape-job";

describe("Scrape Job Repository", () => {
  const testPrefix = `scrapejob-${Date.now()}`;

  async function cleanupTestJobs(): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query("DELETE FROM scrape_jobs WHERE source LIKE $1", [`%${testPrefix}%`]);
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await cleanupTestJobs();
  });

  afterAll(async () => {
    await cleanupTestJobs();
  });

  describe("createScrapeJob", () => {
    it("creates a scrape job with pending status", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-source`,
          query: "test query",
          location: "New York, NY",
        });

        expect(job.id).toBeDefined();
        expect(job.source).toBe(`${testPrefix}-source`);
        expect(job.query).toBe("test query");
        expect(job.location).toBe("New York, NY");
        expect(job.status).toBe("pending");
        expect(job.resultCount).toBeUndefined();
        expect(job.errorMessage).toBeUndefined();
        expect(job.createdAt).toBeInstanceOf(Date);
        expect(job.updatedAt).toBeInstanceOf(Date);
      } finally {
        client.release();
      }
    });

    it("creates a scrape job with special characters in query", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-special`,
          query: "Software engineer @ startup (remote)",
          location: "San Francisco, CA",
        });

        expect(job.query).toBe("Software engineer @ startup (remote)");
      } finally {
        client.release();
      }
    });
  });

  describe("findScrapeJobById", () => {
    it("finds a scrape job by ID", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-find`,
          query: "find test",
          location: "Chicago, IL",
        });

        const found = await findScrapeJobById(client, job.id);

        expect(found).toBeDefined();
        expect(found?.id).toBe(job.id);
        expect(found?.source).toBe(`${testPrefix}-find`);
      } finally {
        client.release();
      }
    });

    it("returns undefined for non-existent job", async () => {
      const client = await getPool().connect();
      try {
        const result = await findScrapeJobById(client, "00000000-0000-0000-0000-000000000000");
        expect(result).toBeUndefined();
      } finally {
        client.release();
      }
    });
  });

  describe("updateScrapeJobStatus", () => {
    it("updates job status from pending to running", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-running`,
          query: "running test",
          location: "Boston, MA",
        });

        expect(job.status).toBe("pending");

        const updated = await updateScrapeJobStatus(client, job.id, "running");

        expect(updated).toBeDefined();
        expect(updated?.status).toBe("running");
        expect(updated?.errorMessage).toBeUndefined();
      } finally {
        client.release();
      }
    });

    it("updates job status to completed with result count", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-completed`,
          query: "completed test",
          location: "Seattle, WA",
        });

        const updated = await updateScrapeJobStatus(client, job.id, "completed", 42);

        expect(updated?.status).toBe("completed");
        expect(updated?.resultCount).toBe(42);
      } finally {
        client.release();
      }
    });

    it("updates job status to failed with error message", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-failed`,
          query: "failed test",
          location: "Austin, TX",
        });

        const updated = await updateScrapeJobStatus(
          client,
          job.id,
          "failed",
          undefined,
          "Connection timeout after 30s"
        );

        expect(updated?.status).toBe("failed");
        expect(updated?.errorMessage).toBe("Connection timeout after 30s");
      } finally {
        client.release();
      }
    });

    it("returns undefined for non-existent job update", async () => {
      const client = await getPool().connect();
      try {
        const result = await updateScrapeJobStatus(
          client,
          "00000000-0000-0000-0000-000000000000",
          "completed"
        );
        expect(result).toBeUndefined();
      } finally {
        client.release();
      }
    });
  });

  describe("findScrapeJobs", () => {
    it("returns all jobs when no filter specified", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        await createScrapeJob(client, {
          source: `${testPrefix}-all-1`,
          query: "all test 1",
          location: "Denver, CO",
        });

        await createScrapeJob(client, {
          source: `${testPrefix}-all-2`,
          query: "all test 2",
          location: "Miami, FL",
        });

        const jobs = await findScrapeJobs(client);

        expect(jobs.length).toBeGreaterThanOrEqual(2);
      } finally {
        client.release();
      }
    });

    it("filters jobs by status", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const pendingJob = await createScrapeJob(client, {
          source: `${testPrefix}-pending-filter`,
          query: "pending filter test",
          location: "Portland, OR",
        });

        await updateScrapeJobStatus(client, pendingJob.id, "completed", 10);

        const completedJobs = await findScrapeJobs(
          client,
          "completed" as ScrapeJobStatus
        );

        const found = completedJobs.find((j) => j.id === pendingJob.id);
        expect(found).toBeDefined();
        expect(found?.status).toBe("completed");
      } finally {
        client.release();
      }
    });

    it("limits results when limit specified", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const jobs = await findScrapeJobs(client, undefined, 1);
        expect(jobs.length).toBeLessThanOrEqual(1);
      } finally {
        client.release();
      }
    });

    it("returns jobs ordered by created_at descending", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job1 = await createScrapeJob(client, {
          source: `${testPrefix}-order-1`,
          query: "order test 1",
          location: "Phoenix, AZ",
        });

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));

        const job2 = await createScrapeJob(client, {
          source: `${testPrefix}-order-2`,
          query: "order test 2",
          location: "Philadelphia, PA",
        });

        const jobs = await findScrapeJobs(client);

        // Most recent should be first
        expect(jobs[0].id).toBe(job2.id);
      } finally {
        client.release();
      }
    });
  });

  describe("deleteScrapeJob", () => {
    it("deletes a scrape job and returns the deleted job", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-delete`,
          query: "delete test",
          location: "Dallas, TX",
        });

        const deleted = await deleteScrapeJob(client, job.id);

        expect(deleted).toBeDefined();
        expect(deleted?.id).toBe(job.id);
        expect(deleted?.source).toBe(`${testPrefix}-delete`);

        const found = await findScrapeJobById(client, job.id);
        expect(found).toBeUndefined();
      } finally {
        client.release();
      }
    });

    it("returns undefined for non-existent job deletion", async () => {
      const client = await getPool().connect();
      try {
        const result = await deleteScrapeJob(
          client,
          "00000000-0000-0000-0000-000000000000"
        );
        expect(result).toBeUndefined();
      } finally {
        client.release();
      }
    });

    it("deletes job with completed status", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-delete-completed`,
          query: "delete completed test",
          location: "Houston, TX",
        });

        await updateScrapeJobStatus(client, job.id, "completed", 100);

        const deleted = await deleteScrapeJob(client, job.id);

        expect(deleted?.status).toBe("completed");
        expect(deleted?.resultCount).toBe(100);
      } finally {
        client.release();
      }
    });

    it("deletes job with failed status and error message", async () => {
      const client = await getPool().connect();
      try {
        await initializeScrapeJobSchema(client);

        const job = await createScrapeJob(client, {
          source: `${testPrefix}-delete-failed`,
          query: "delete failed test",
          location: "Phoenix, AZ",
        });

        await updateScrapeJobStatus(
          client,
          job.id,
          "failed",
          undefined,
          "Test error message"
        );

        const deleted = await deleteScrapeJob(client, job.id);

        expect(deleted?.status).toBe("failed");
        expect(deleted?.errorMessage).toBe("Test error message");
      } finally {
        client.release();
      }
    });
  });
});
