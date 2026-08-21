/**
 * Scrape Jobs API Route Tests
 */

import { NextRequest } from "next/server";
import { POST, GET } from "./route";

// Mock the database modules
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/scrape-job-repository", () => ({
  createScrapeJob: jest.fn(),
  findScrapeJobs: jest.fn(),
  findScrapeJobById: jest.fn(),
  updateScrapeJobStatus: jest.fn(),
}));

const { createScrapeJob, findScrapeJobs } = require("@/lib/db/scrape-job-repository");

describe("Scrape Jobs API Route", () => {
  const mockPool = {
    connect: jest.fn(),
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock pool
    (require("@/lib/db/user-repository").getPool as jest.Mock).mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);

    // Mock client.query to return a mock job
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: "test-job-id",
          source: "linkedin",
          query: "software engineer",
          location: "New York, NY",
          status: "pending",
          result_count: null,
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    // Mock createScrapeJob to return the expected job
    createScrapeJob.mockImplementation(async (client, input) => ({
      id: "test-job-id",
      source: input.source,
      query: input.query,
      location: input.location,
      status: "pending" as const,
      resultCount: undefined,
      errorMessage: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Mock findScrapeJobs - tests will set their own values with mockResolvedValueOnce
    findScrapeJobs.mockImplementation(async () => []);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("POST /api/scrape-jobs", () => {
    it("creates a scrape job with valid input", async () => {
      const requestBody = {
        source: "linkedin",
        query: "software engineer",
        location: "New York, NY",
      };

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.source).toBe("linkedin");
      expect(json.data.query).toBe("software engineer");
      expect(json.data.location).toBe("New York, NY");
      expect(json.data.status).toBe("pending");
      expect(json.message).toBe("Scrape job created successfully");
    });

    it("returns 400 when source is missing", async () => {
      const requestBody = {
        query: "software engineer",
        location: "New York, NY",
      };

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("source");
    });

    it("returns 400 when query is missing", async () => {
      const requestBody = {
        source: "linkedin",
        location: "New York, NY",
      };

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("query");
    });

    it("returns 400 when location is missing", async () => {
      const requestBody = {
        source: "linkedin",
        query: "software engineer",
      };

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("location");
    });

    it("returns 400 when all fields are missing", async () => {
      const requestBody = {};

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("source");
      expect(json.error).toContain("query");
      expect(json.error).toContain("location");
    });

    it("handles empty string values as missing", async () => {
      const requestBody = {
        source: "",
        query: "",
        location: "",
      };

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it("handles special characters in input", async () => {
      const requestBody = {
        source: "github",
        query: "Rust developer (remote) @ startup",
        location: "San Francisco, CA",
      };

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.query).toBe("Rust developer (remote) @ startup");
    });

    it("returns 500 on database error", async () => {
      // Reset the mock to throw an error for this test
      createScrapeJob.mockRejectedValueOnce(new Error("Database connection failed"));

      const requestBody = {
        source: "linkedin",
        query: "software engineer",
        location: "New York, NY",
      };

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });
  });

  describe("GET /api/scrape-jobs", () => {
    it("returns all scrape jobs", async () => {
      findScrapeJobs.mockResolvedValueOnce([
        {
          id: "job-1",
          source: "linkedin",
          query: "job 1",
          location: "NY",
          status: "pending" as const,
          resultCount: null,
          errorMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "job-2",
          source: "github",
          query: "job 2",
          location: "CA",
          status: "completed" as const,
          resultCount: 10,
          errorMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs");
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(2);
    });

    it("filters jobs by status", async () => {
      findScrapeJobs.mockResolvedValueOnce([
        {
          id: "job-1",
          source: "linkedin",
          query: "job 1",
          location: "NY",
          status: "pending" as const,
          resultCount: null,
          errorMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs?status=pending");
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].status).toBe("pending");
    });

    it("returns 500 on database error", async () => {
      findScrapeJobs.mockRejectedValueOnce(new Error("Database connection failed"));

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs");
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });
  });
});
