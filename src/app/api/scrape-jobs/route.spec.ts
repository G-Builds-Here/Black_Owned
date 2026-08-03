/**
 * Scrape Jobs API Route Tests
<<<<<<< HEAD
 */

import { NextRequest } from "next/server";
import { POST, GET } from "./route";

// Mock the database modules
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/scrape-job-repository", () => ({
  initializeScrapeJobSchema: jest.fn().mockResolvedValue(undefined),
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
=======
 *
 * Tests for /api/scrape-jobs endpoint
 */

import { POST, GET } from "./route";
import { createScrapeJob, getScrapeJobSummary } from "@/lib/db/scrape-job-repository";

// Mock the scrape job repository
jest.mock("@/lib/db/scrape-job-repository", () => ({
  createScrapeJob: jest.fn(),
  getScrapeJobSummary: jest.fn(),
}));

describe("POST /api/scrape-jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("should return 400 when source is missing", async () => {
    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", location: "test" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Missing required fields: source, query, location");
    expect(json.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "source",
          message: "Source is required",
        }),
      ])
    );
  });

  it("should return 400 when query is missing", async () => {
    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "google-maps", location: "test" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Missing required fields: source, query, location");
  });

  it("should return 400 when location is missing", async () => {
    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "google-maps", query: "test" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Missing required fields: source, query, location");
  });

  it("should return 400 when source is invalid", async () => {
    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "invalid-source",
        query: "test",
        location: "test",
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid source");
    expect(json.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "source",
          message: expect.stringContaining("google-maps"),
        }),
      ])
    );
  });

  it("should return 201 and created job on successful creation with google-maps source", async () => {
    const mockResult = {
      id: "test-job-id-123",
      source: "google-maps",
      query: "restaurants",
      location: "Los Angeles",
      status: "pending" as const,
      created_at: new Date("2026-08-02T10:00:00Z"),
    };

    (createScrapeJob as jest.Mock).mockResolvedValue(mockResult);

    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "google-maps",
        query: "restaurants",
        location: "Los Angeles",
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      id: "test-job-id-123",
      source: "google-maps",
      query: "restaurants",
      location: "Los Angeles",
      status: "pending",
      created_at: "2026-08-02T10:00:00.000Z",
    });
    expect(createScrapeJob).toHaveBeenCalledWith({
      source: "google-maps",
      query: "restaurants",
      location: "Los Angeles",
    });
  });

  it("should return 201 and created job on successful creation with yelp source", async () => {
    const mockResult = {
      id: "yelp-job-id-456",
      source: "yelp",
      query: "plumbers",
      location: "New York",
      status: "pending" as const,
      created_at: new Date("2026-08-02T11:00:00Z"),
    };

    (createScrapeJob as jest.Mock).mockResolvedValue(mockResult);

    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "yelp",
        query: "plumbers",
        location: "New York",
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.source).toBe("yelp");
    expect(createScrapeJob).toHaveBeenCalledWith({
      source: "yelp",
      query: "plumbers",
      location: "New York",
    });
  });

  it("should return 201 and created job on successful creation with facebook source", async () => {
    const mockResult = {
      id: "fb-job-id-789",
      source: "facebook",
      query: "local businesses",
      location: "Chicago",
      status: "pending" as const,
      created_at: new Date("2026-08-02T12:00:00Z"),
    };

    (createScrapeJob as jest.Mock).mockResolvedValue(mockResult);

    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "facebook",
        query: "local businesses",
        location: "Chicago",
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.source).toBe("facebook");
    expect(createScrapeJob).toHaveBeenCalledWith({
      source: "facebook",
      query: "local businesses",
      location: "Chicago",
    });
  });

  it("should return 500 when request body is invalid JSON", async () => {
    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("should return 500 when createScrapeJob throws an error", async () => {
    (createScrapeJob as jest.Mock).mockRejectedValue(new Error("Database error"));

    const request = new Request("http://localhost/api/scrape-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "google-maps",
        query: "test",
        location: "test",
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Internal server error");
  });
});

describe("GET /api/scrape-jobs/summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 with summary data", async () => {
    // Arrange
    const mockSummary = {
      total_jobs: 10,
      successful_jobs: 7,
      failed_jobs: 2,
      pending_jobs: 1,
      running_jobs: 0,
      last_30_days: {
        total_jobs: 5,
        successful_jobs: 3,
        failed_jobs: 1,
      },
    };
    (getScrapeJobSummary as jest.Mock).mockResolvedValue(mockSummary);

    const request = new Request("http://localhost/api/scrape-jobs/summary");

    // Act
    const response = await GET(request);
    const json = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total_jobs).toBe(10);
    expect(json.data.successful_jobs).toBe(7);
    expect(json.data.failed_jobs).toBe(2);
    expect(json.data.pending_jobs).toBe(1);
    expect(json.data.running_jobs).toBe(0);
    expect(json.data.period.days).toBe(30);
    expect(json.data.period.total_jobs).toBe(5);
  });

  it("should accept custom days parameter", async () => {
    // Arrange
    const mockSummary = {
      total_jobs: 5,
      successful_jobs: 3,
      failed_jobs: 1,
      pending_jobs: 1,
      running_jobs: 0,
      last_30_days: {
        total_jobs: 3,
        successful_jobs: 2,
        failed_jobs: 0,
      },
    };
    (getScrapeJobSummary as jest.Mock).mockResolvedValue(mockSummary);

    const request = new Request("http://localhost/api/scrape-jobs/summary?days=7");

    // Act
    const response = await GET(request);
    const json = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(json.data.period.days).toBe(7);
    expect(getScrapeJobSummary).toHaveBeenCalledWith(7);
  });

  it("should default to 30 days when no parameter provided", async () => {
    // Arrange
    (getScrapeJobSummary as jest.Mock).mockResolvedValue({
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      pending_jobs: 0,
      running_jobs: 0,
      last_30_days: { total_jobs: 0, successful_jobs: 0, failed_jobs: 0 },
    });

    const request = new Request("http://localhost/api/scrape-jobs/summary");

    // Act
    await GET(request);

    // Assert
    expect(getScrapeJobSummary).toHaveBeenCalledWith(30);
  });

  it("should return 500 when getScrapeJobSummary throws an error", async () => {
    // Arrange
    (getScrapeJobSummary as jest.Mock).mockRejectedValue(new Error("Database connection failed"));

    const request = new Request("http://localhost/api/scrape-jobs/summary");

    // Act
    const response = await GET(request);
    const json = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Internal server error");
  });

  it("should handle invalid days parameter gracefully", async () => {
    // Arrange
    (getScrapeJobSummary as jest.Mock).mockResolvedValue({
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      pending_jobs: 0,
      running_jobs: 0,
      last_30_days: { total_jobs: 0, successful_jobs: 0, failed_jobs: 0 },
    });

    const request = new Request("http://localhost/api/scrape-jobs/summary?days=invalid");

    // Act
    const response = await GET(request);
    const json = await response.json();

    // Assert: Should default to 30 when invalid
    expect(response.status).toBe(200);
    expect(json.data.period.days).toBe(30);
  });
>>>>>>> feature/LOC-0059-AC1
});
