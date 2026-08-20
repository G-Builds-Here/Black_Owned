/**
 * API Route Tests: Get scraped businesses by job ID
 *
 * Tests for /api/admin/reviews/job/[jobId]
 */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { getPool } from "@/lib/db/user-repository";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import { findScrapedBusinessesByJobId } from "@/lib/db/scraped-business-repository";

// Mock dependencies
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/scrape-job-repository", () => ({
  findScrapeJobById: jest.fn(),
}));

jest.mock("@/lib/db/scraped-business-repository", () => ({
  findScrapedBusinessesByJobId: jest.fn(),
}));

describe("GET /api/admin/reviews/job/[jobId]", () => {
  const mockJobId = "test-job-123";
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockResolvedValue(mockClient),
    });
  });

  const mockJob = {
    id: mockJobId,
    source: "Google Maps",
    query: "Black owned restaurants",
    location: "Atlanta, GA",
    status: "completed" as const,
    // Entity field is businessCount (snake_case business_count in the DB row,
    // mapped to camelCase by findScrapeJobById). The route maps it to the
    // response's resultCount.
    businessCount: 5,
    errorMessage: undefined,
    createdAt: new Date("2026-08-12T10:00:00Z"),
    updatedAt: new Date("2026-08-12T10:05:00Z"),
  };

  const mockBusinesses = [
    {
      id: "biz-1",
      scrapeJobId: mockJobId,
      source: "google-maps" as const,
      name: "Test Restaurant 1",
      address: "123 Test St, Atlanta GA",
      phone: "(404) 555-0001",
      website: "https://test1.example.com",
      category: "Restaurant",
      rating: 4.5,
      reviewCount: 50,
      status: "pending_review" as const,
      createdAt: new Date("2026-08-12T10:01:00Z"),
      updatedAt: new Date("2026-08-12T10:01:00Z"),
    },
    {
      id: "biz-2",
      scrapeJobId: mockJobId,
      source: "google-maps" as const,
      name: "Test Restaurant 2",
      address: "456 Test Ave, Atlanta GA",
      phone: "(404) 555-0002",
      website: undefined,
      category: "Restaurant",
      rating: 4.0,
      reviewCount: 30,
      status: "pending_review" as const,
      createdAt: new Date("2026-08-12T10:02:00Z"),
      updatedAt: new Date("2026-08-12T10:02:00Z"),
    },
  ];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns 400 when job ID is missing", async () => {
    const request = new NextRequest("http://localhost/api/admin/reviews/job/");

    const response = await GET(request, { params: { jobId: "" } });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Job ID is required");
  });

  it("returns 404 when job is not found", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(`http://localhost/api/admin/reviews/job/${mockJobId}`);

    const response = await GET(request, { params: { jobId: mockJobId } });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Job not found");
  });

  it("returns businesses for a valid job ID", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue(mockBusinesses);

    const request = new NextRequest(`http://localhost/api/admin/reviews/job/${mockJobId}`);

    const response = await GET(request, { params: { jobId: mockJobId } });

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].name).toBe("Test Restaurant 1");
    expect(json.data[1].name).toBe("Test Restaurant 2");
    expect(json.job.id).toBe(mockJobId);
    expect(json.job.source).toBe("Google Maps");
  });

  it("transforms businesses to review-friendly format", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue(mockBusinesses);

    const request = new NextRequest(`http://localhost/api/admin/reviews/job/${mockJobId}`);

    const response = await GET(request, { params: { jobId: mockJobId } });

    const json = await response.json();

    // Check transformed fields
    expect(json.data[0].id).toBe("biz-1");
    expect(json.data[0].name).toBe("Test Restaurant 1");
    expect(json.data[0].address).toBe("123 Test St, Atlanta GA");
    expect(json.data[0].source).toBe("google-maps");
    expect(json.data[0].rating).toBe(4.5);
    expect(json.data[0].submittedAt).toBe("2026-08-12");
    expect(json.data[0].category).toBe("Restaurant");
    expect(json.data[0].phone).toBe("(404) 555-0001");
    expect(json.data[0].website).toBe("https://test1.example.com");
    expect(json.data[0].originalData).toEqual({
      scrapeJobId: mockJobId,
      status: "pending_review",
      createdAt: "2026-08-12T10:01:00.000Z",
    });
  });

  it("returns empty array when job has no businesses", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest(`http://localhost/api/admin/reviews/job/${mockJobId}`);

    const response = await GET(request, { params: { jobId: mockJobId } });

    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(0);
    expect(json.job.id).toBe(mockJobId);
  });

  it("handles database errors gracefully", async () => {
    (findScrapeJobById as jest.Mock).mockRejectedValue(new Error("Database connection failed"));

    const request = new NextRequest(`http://localhost/api/admin/reviews/job/${mockJobId}`);

    const response = await GET(request, { params: { jobId: mockJobId } });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Database connection failed");
  });

  it("releases database client after query", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue(mockBusinesses);

    const request = new NextRequest(`http://localhost/api/admin/reviews/job/${mockJobId}`);

    await GET(request, { params: { jobId: mockJobId } });

    expect(mockClient.release).toHaveBeenCalled();
  });

  it("includes job metadata in response", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue(mockBusinesses);

    const request = new NextRequest(`http://localhost/api/admin/reviews/job/${mockJobId}`);

    const response = await GET(request, { params: { jobId: mockJobId } });

    const json = await response.json();

    expect(json.job).toEqual(
      expect.objectContaining({
        id: mockJobId,
        source: "Google Maps",
        query: "Black owned restaurants",
        location: "Atlanta, GA",
        status: "completed",
        resultCount: 5,
      })
    );
  });
});
