/**
 * Scrape Jobs API Route Tests
 *
 * Tests for /api/scrape-jobs endpoint
 */

import { POST } from "./route";
import { createScrapeJob } from "@/lib/db/scrape-job-repository";

// Mock the scrape job repository
jest.mock("@/lib/db/scrape-job-repository", () => ({
  createScrapeJob: jest.fn(),
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
