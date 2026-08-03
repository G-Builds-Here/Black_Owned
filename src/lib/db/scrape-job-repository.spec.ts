/**
<<<<<<< HEAD
 * Scrape Job Repository Unit Tests
 */

import { getPool } from "./user-repository";
import {
  initializeScrapeJobSchema,
  createScrapeJob,
  findScrapeJobById,
  updateScrapeJobStatus,
  findScrapeJobs,
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
=======
 * Scrape Job Repository Tests
 */

import {
  createScrapeJob,
  findScrapeJobById,
  findAllScrapeJobs,
  updateScrapeJobStatus,
  updateScrapeJobBusinessCount,
  getScrapeJobSummary,
  initializeScrapeJobSchema,
} from "./scrape-job-repository";
import { CreateScrapeJobInput, ScraperSource, ScrapeJobStatus } from "../../types/scrape-job";
import { getPool } from "./user-repository";

// Module-level mock functions - accessible from tests
const mockQuery = jest.fn();
const mockConnection = {
  query: mockQuery,
  release: jest.fn(),
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockConnection),
};

// Mock the user-repository module
jest.mock("./user-repository", () => ({
  getPool: jest.fn(() => mockPool),
}));

describe("ScrapeJobRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore mock implementations after clearing
    mockPool.connect.mockResolvedValue(mockConnection);
    mockConnection.release.mockResolvedValue(undefined);
  });

  describe("createScrapeJob", () => {
    it("should create a scrape job with valid input", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "black owned restaurants",
        location: "New York, NY",
      };

      const mockResult = {
        rows: [{
          id: "test-id-123",
          source: input.source,
          query: input.query,
          location: input.location,
          status: "pending",
          businesses_scraped: 0,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const result = await createScrapeJob(input);

      expect(result).toBeDefined();
      expect(result.id).toBe("test-id-123");
      expect(result.source).toBe(input.source);
      expect(result.query).toBe(input.query);
      expect(result.location).toBe(input.location);
      expect(result.status).toBe("pending");
    });

    it("should create a scrape job with yelp source", async () => {
      const input: CreateScrapeJobInput = {
        source: "yelp",
        query: "black owned cafes",
        location: "Los Angeles, CA",
      };

      const mockResult = {
        rows: [{
          id: "test-id-456",
          source: input.source,
          query: input.query,
          location: input.location,
          status: "pending",
          businesses_scraped: 0,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

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

      const mockResult = {
        rows: [{
          id: "test-id-789",
          source: input.source,
          query: input.query,
          location: input.location,
          status: "pending",
          businesses_scraped: 0,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

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

      const mockResult1 = {
        rows: [{
          id: "test-id-1",
          source: input.source,
          query: input.query,
          location: input.location,
          status: "pending",
          businesses_scraped: 0,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };
      const mockResult2 = {
        rows: [{
          id: "test-id-2",
          source: input.source,
          query: input.query,
          location: input.location,
          status: "pending",
          businesses_scraped: 0,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };
      mockQuery.mockResolvedValueOnce(mockResult1);
      mockQuery.mockResolvedValueOnce(mockResult2);

      const job1 = await createScrapeJob(input);
      const job2 = await createScrapeJob(input);

      expect(job1.id).not.toBe(job2.id);
>>>>>>> feature/LOC-0059-AC1
    });
  });

  describe("findScrapeJobById", () => {
<<<<<<< HEAD
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
=======
    it("should find a scrape job by ID", async () => {
      const mockJob = {
        id: "test-id-123",
        source: "google-maps",
        query: "find test query",
        location: "find test location",
        status: "pending",
        businesses_scraped: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockJob] });

      const found = await findScrapeJobById("test-id-123");

      expect(found).toBeDefined();
      expect(found?.id).toBe("test-id-123");
      expect(found?.source).toBe("google-maps");
    });

    it("should return null for non-existent ID", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await findScrapeJobById("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  describe("findAllScrapeJobs", () => {
    it("should return empty list when no jobs exist", async () => {
      // Repository calls count query first, then main query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await findAllScrapeJobs(1, 20);

      expect(result.jobs).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(0);
    });

    it("should return paginated results", async () => {
      const mockJobs = [
        { id: "job-1", source: "google-maps", query: "test 1", location: "loc", status: "pending", businesses_scraped: 0, created_at: new Date(), updated_at: new Date() },
        { id: "job-2", source: "google-maps", query: "test 2", location: "loc", status: "pending", businesses_scraped: 0, created_at: new Date(), updated_at: new Date() },
      ];
      // Repository calls count query first, then main query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "2" }] });
      mockQuery.mockResolvedValueOnce({ rows: mockJobs });

      const result = await findAllScrapeJobs(1, 10);

      expect(result.jobs.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it("should filter by status", async () => {
      const mockJobs = [
        { id: "job-1", source: "google-maps", query: "test", location: "loc", status: "pending", businesses_scraped: 0, created_at: new Date(), updated_at: new Date() },
      ];
      // Repository calls count query first, then main query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }] });
      mockQuery.mockResolvedValueOnce({ rows: mockJobs });

      const result = await findAllScrapeJobs(1, 20, "pending");

      expect(result.jobs.every((job) => job.status === "pending")).toBe(true);
>>>>>>> feature/LOC-0059-AC1
    });
  });

  describe("updateScrapeJobStatus", () => {
<<<<<<< HEAD
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
=======
    it("should update scrape job status", async () => {
      const mockUpdatedJob = {
        id: "test-id",
        source: "google-maps",
        query: "status test",
        location: "location",
        status: "running",
        businesses_scraped: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedJob] });

      const updated = await updateScrapeJobStatus("test-id", "running");

      expect(updated?.status).toBe("running");
      expect(updated?.updated_at).toBeInstanceOf(Date);
    });

    it("should return null for non-existent ID", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateScrapeJobStatus("00000000-0000-0000-0000-000000000000", "running");
      expect(result).toBeNull();
    });
  });

  describe("updateScrapeJobBusinessCount", () => {
    it("should update business count", async () => {
      const mockUpdatedJob = {
        id: "test-id",
        source: "google-maps",
        query: "count test",
        location: "location",
        status: "pending",
        businesses_scraped: 42,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedJob] });

      const updated = await updateScrapeJobBusinessCount("test-id", 42);

      expect(updated?.businesses_scraped).toBe(42);
    });

    it("should handle zero business count", async () => {
      const mockUpdatedJob = {
        id: "test-id",
        source: "google-maps",
        query: "zero count test",
        location: "location",
        status: "pending",
        businesses_scraped: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedJob] });

      const updated = await updateScrapeJobBusinessCount("test-id", 0);

      expect(updated?.businesses_scraped).toBe(0);
    });

    it("should return null for non-existent ID", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateScrapeJobBusinessCount("00000000-0000-0000-0000-000000000000", 10);
      expect(result).toBeNull();
    });
  });

  describe("getScrapeJobSummary", () => {
    it("should return summary with all job states", async () => {
      // Arrange: Mock the database response with jobs in different states
      const mockSummaryResult = {
        rows: [{
          total_jobs: 10,
          successful_jobs: 5,
          failed_jobs: 2,
          pending_jobs: 2,
          running_jobs: 1,
        }],
      };
      const mockDaysResult = {
        rows: [{
          total_jobs: 5,
          successful_jobs: 3,
          failed_jobs: 1,
        }],
      };
      mockQuery.mockResolvedValueOnce(mockSummaryResult);
      mockQuery.mockResolvedValueOnce(mockDaysResult);

      // Act
      const result = await getScrapeJobSummary();

      // Assert
      expect(result.total_jobs).toBe(10);
      expect(result.successful_jobs).toBe(5);
      expect(result.failed_jobs).toBe(2);
      expect(result.pending_jobs).toBe(2);
      expect(result.running_jobs).toBe(1);
      expect(result.last_30_days.total_jobs).toBe(5);
      expect(result.last_30_days.successful_jobs).toBe(3);
      expect(result.last_30_days.failed_jobs).toBe(1);
    });

    it("should return zeros when no jobs exist", async () => {
      // Arrange: Mock empty database response
      const mockSummaryResult = {
        rows: [{
          total_jobs: 0,
          successful_jobs: 0,
          failed_jobs: 0,
          pending_jobs: 0,
          running_jobs: 0,
        }],
      };
      const mockDaysResult = {
        rows: [{
          total_jobs: 0,
          successful_jobs: 0,
          failed_jobs: 0,
        }],
      };
      mockQuery.mockResolvedValueOnce(mockSummaryResult);
      mockQuery.mockResolvedValueOnce(mockDaysResult);

      // Act: Get summary from empty database
      const result = await getScrapeJobSummary();

      // Assert: All counts should be zero
      expect(result.total_jobs).toBe(0);
      expect(result.successful_jobs).toBe(0);
      expect(result.failed_jobs).toBe(0);
      expect(result.pending_jobs).toBe(0);
      expect(result.running_jobs).toBe(0);
      expect(result.last_30_days.total_jobs).toBe(0);
    });

    it("should accept custom days parameter", async () => {
      // Arrange: Mock database response
      const mockSummaryResult = {
        rows: [{
          total_jobs: 5,
          successful_jobs: 3,
          failed_jobs: 1,
          pending_jobs: 1,
          running_jobs: 0,
        }],
      };
      const mockDaysResult = {
        rows: [{
          total_jobs: 3,
          successful_jobs: 2,
          failed_jobs: 0,
        }],
      };
      mockQuery.mockResolvedValueOnce(mockSummaryResult);
      mockQuery.mockResolvedValueOnce(mockDaysResult);

      // Act with different day parameters
      const summary7Days = await getScrapeJobSummary(7);

      // Assert
      expect(summary7Days.total_jobs).toBe(5);
      expect(summary7Days.last_30_days.total_jobs).toBe(3);
>>>>>>> feature/LOC-0059-AC1
    });
  });
});
