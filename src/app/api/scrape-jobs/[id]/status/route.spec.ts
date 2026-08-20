/**
 * Scrape Job Status API Route Tests
 *
 * Tests for GET /api/scrape-jobs/:id/status endpoint
 */

import { NextRequest } from "next/server";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import { GET } from "./route";

// Mock the repository
jest.mock("@/lib/db/scrape-job-repository");

const mockFindScrapeJobById = findScrapeJobById as jest.MockedFunction<typeof findScrapeJobById>;

describe("GET /api/scrape-jobs/:id/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 when job ID is missing", async () => {
    const request = new NextRequest("http://localhost/api/scrape-jobs//status");
    const response = await GET(request, { params: { id: "" } });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Job ID is required");
  });

  it("should return 404 when job does not exist", async () => {
    mockFindScrapeJobById.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/scrape-jobs/123/status");
    const response = await GET(request, { params: { id: "123" } });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Job not found");
  });

  it("should return job status when job exists", async () => {
    const mockJob = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      source: "google-maps" as const,
      query: "restaurants",
      location: "New York",
      status: "running" as const,
      // findScrapeJobById returns a camelCase entity (business_count is
      // mapped to businessCount, created_at/updated_at to createdAt/updatedAt).
      businessCount: 42,
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T10:30:00Z"),
    };

    mockFindScrapeJobById.mockResolvedValue(mockJob);

    const request = new NextRequest("http://localhost/api/scrape-jobs/123e4567-e89b-12d3-a456-426614174000/status");
    const response = await GET(request, { params: { id: "123e4567-e89b-12d3-a456-426614174000" } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      id: mockJob.id,
      source: mockJob.source,
      query: mockJob.query,
      location: mockJob.location,
      status: mockJob.status,
      businessCount: mockJob.businessCount,
      createdAt: "2024-01-15T10:00:00.000Z",
      updatedAt: "2024-01-15T10:30:00.000Z",
    });
  });

  it("should return pending status correctly", async () => {
    const mockJob = {
      id: "123e4567-e89b-12d3-a456-426614174001",
      source: "yelp" as const,
      query: "plumbers",
      location: "Los Angeles",
      status: "pending" as const,
      business_count: 0,
      created_at: new Date("2024-01-16T08:00:00Z"),
      updated_at: new Date("2024-01-16T08:00:00Z"),
    };

    mockFindScrapeJobById.mockResolvedValue(mockJob);

    const request = new NextRequest("http://localhost/api/scrape-jobs/123e4567-e89b-12d3-a456-426614174001/status");
    const response = await GET(request, { params: { id: "123e4567-e89b-12d3-a456-426614174001" } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("pending");
  });

  it("should return completed status correctly", async () => {
    const mockJob = {
      id: "123e4567-e89b-12d3-a456-426614174002",
      source: "facebook" as const,
      query: "coffee shops",
      location: "Chicago",
      status: "completed" as const,
      business_count: 156,
      created_at: new Date("2024-01-14T06:00:00Z"),
      updated_at: new Date("2024-01-14T08:30:00Z"),
    };

    mockFindScrapeJobById.mockResolvedValue(mockJob);

    const request = new NextRequest("http://localhost/api/scrape-jobs/123e4567-e89b-12d3-a456-426614174002/status");
    const response = await GET(request, { params: { id: "123e4567-e89b-12d3-a456-426614174002" } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("completed");
  });

  it("should return failed status correctly", async () => {
    const mockJob = {
      id: "123e4567-e89b-12d3-a456-426614174003",
      source: "google-maps" as const,
      query: "dentists",
      location: "Houston",
      status: "failed" as const,
      business_count: 0,
      created_at: new Date("2024-01-13T14:00:00Z"),
      updated_at: new Date("2024-01-13T14:15:00Z"),
    };

    mockFindScrapeJobById.mockResolvedValue(mockJob);

    const request = new NextRequest("http://localhost/api/scrape-jobs/123e4567-e89b-12d3-a456-426614174003/status");
    const response = await GET(request, { params: { id: "123e4567-e89b-12d3-a456-426614174003" } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("failed");
  });

  it("should return 500 on repository error", async () => {
    mockFindScrapeJobById.mockRejectedValue(new Error("Database connection failed"));

    const request = new NextRequest("http://localhost/api/scrape-jobs/123/status");
    const response = await GET(request, { params: { id: "123" } });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Internal server error");
  });
});
