/**
 * Scrape Jobs API Route Tests
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

});
