/**
 * Scrape Job Results API Tests
 *
 * Tests for GET /api/scrape-jobs/[id]/results
 */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import {
  findScrapedBusinessesByJobId,
  initializeScrapedBusinessSchema,
} from "@/lib/db/scraped-business-repository";
import { getPool } from "@/lib/db/user-repository";

// Mock dependencies
jest.mock("@/lib/db/scrape-job-repository");
jest.mock("@/lib/db/scraped-business-repository");
jest.mock("@/lib/db/user-repository");

describe("GET /api/scrape-jobs/[id]/results", () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockReturnValue(mockPool);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("returns 400 for invalid UUID format", async () => {
    const request = new NextRequest("http://localhost/api/scrape-jobs/invalid-id/results");
    const context = { params: Promise.resolve({ id: "invalid-id" }) };

    const response = await GET(request, context);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid job ID format");
    expect(json.code).toBe("INVALID_ID");
  });

  it("returns 404 when scrape job does not exist", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440000";
    (findScrapeJobById as jest.Mock).mockResolvedValue(undefined);
    (mockClient.query as jest.Mock).mockResolvedValue({ rows: [] });

    const request = new NextRequest(`http://localhost/api/scrape-jobs/${jobId}/results`);
    const context = { params: Promise.resolve({ id: jobId }) };

    const response = await GET(request, context);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Scrape job not found");
    expect(json.code).toBe("NOT_FOUND");
  });

  it("returns 200 with empty businesses array when job has no results", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440000";
    const mockJob = {
      id: jobId,
      source: "google_maps",
      query: "restaurants",
      location: "New York",
      status: "completed",
      business_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([]);
    (mockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] }) // initialize schema
      .mockResolvedValueOnce({ rows: [mockJob] }) // findScrapeJobById
      .mockResolvedValueOnce({ rows: [] }); // findScrapedBusinessesByJobId

    const request = new NextRequest(`http://localhost/api/scrape-jobs/${jobId}/results`);
    const context = { params: Promise.resolve({ id: jobId }) };

    const response = await GET(request, context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe(jobId);
    expect(json.data.businessCount).toBe(0);
    expect(json.data.businesses).toEqual([]);
  });

  it("returns 200 with scraped businesses when job has results", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440000";
    const mockJob = {
      id: jobId,
      source: "google_maps",
      query: "restaurants",
      location: "New York",
      status: "completed",
      business_count: 2,
      extracted_metadata: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockBusinesses = [
      {
        id: "660e8400-e29b-41d4-a716-446655440001",
        scrapeJobId: jobId,
        source: "google_maps",
        name: "Test Restaurant 1",
        address: "123 Main St, New York, NY",
        phone: "+1-555-0001",
        website: "https://test1.com",
        category: "Restaurant",
        rating: 4.5,
        reviewCount: 120,
        status: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "660e8400-e29b-41d4-a716-446655440002",
        scrapeJobId: jobId,
        source: "google_maps",
        name: "Test Restaurant 2",
        address: "456 Oak Ave, New York, NY",
        phone: "+1-555-0002",
        website: "https://test2.com",
        category: "Restaurant",
        rating: 4.2,
        reviewCount: 85,
        status: "pending_review",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue(mockBusinesses);

    const request = new NextRequest(`http://localhost/api/scrape-jobs/${jobId}/results`);
    const context = { params: Promise.resolve({ id: jobId }) };

    const response = await GET(request, context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe(jobId);
    expect(json.data.businessCount).toBe(2);
    expect(json.data.businesses).toHaveLength(2);
    expect(json.data.businesses[0].name).toBe("Test Restaurant 1");
    expect(json.data.businesses[1].name).toBe("Test Restaurant 2");
  });

  it("initializes schema before fetching businesses", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440000";
    const mockJob = {
      id: jobId,
      source: "google_maps",
      query: "restaurants",
      location: "New York",
      status: "completed",
      business_count: 0,
      extracted_metadata: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest(`http://localhost/api/scrape-jobs/${jobId}/results`);
    const context = { params: Promise.resolve({ id: jobId }) };

    await GET(request, context);

    expect(initializeScrapedBusinessSchema).toHaveBeenCalled();
    expect(findScrapedBusinessesByJobId).toHaveBeenCalledWith(mockClient, jobId);
  });

  it("returns 400 when job is not completed", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440000";
    const runningJob = {
      id: jobId,
      source: "google_maps",
      query: "restaurants",
      location: "New York",
      status: "running",
      business_count: 0,
      extracted_metadata: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    (findScrapeJobById as jest.Mock).mockResolvedValue(runningJob);

    const request = new NextRequest(`http://localhost/api/scrape-jobs/${jobId}/results`);
    const context = { params: Promise.resolve({ id: jobId }) };

    const response = await GET(request, context);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Job is not completed yet");
    expect(json.code).toBe("JOB_NOT_COMPLETED");
    expect(json.status).toBe("running");
  });

  it("returns 500 on internal error", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440000";
    (findScrapeJobById as jest.Mock).mockRejectedValue(new Error("Database error"));

    const request = new NextRequest(`http://localhost/api/scrape-jobs/${jobId}/results`);
    const context = { params: Promise.resolve({ id: jobId }) };

    const response = await GET(request, context);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Internal server error");
  });
});
