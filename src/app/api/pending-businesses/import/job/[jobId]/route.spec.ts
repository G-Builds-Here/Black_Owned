/**
 * POST /api/pending-businesses/import/job/[jobId] tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import {
  findScrapedBusinessesByJobId,
  initializeScrapedBusinessSchema,
} from "@/lib/db/scraped-business-repository";
import {
  importNormalizedBusinesses,
  initializePendingImportSchema,
} from "@/lib/db/pending-import-business-repository";
import { POST } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/scrape-job-repository", () => ({
  findScrapeJobById: jest.fn(),
}));

jest.mock("@/lib/db/scraped-business-repository", () => ({
  findScrapedBusinessesByJobId: jest.fn(),
  initializeScrapedBusinessSchema: jest.fn(),
}));

jest.mock("@/lib/db/pending-import-business-repository", () => ({
  importNormalizedBusinesses: jest.fn(),
  initializePendingImportSchema: jest.fn(),
}));

const JOB_ID = "11111111-1111-4111-8111-111111111111";

const mockJob = {
  id: JOB_ID,
  status: "completed",
};

const mockScraped = [
  {
    id: "scraped-1",
    scrapeJobId: JOB_ID,
    source: "yelp",
    name: "Soul Kitchen",
    address: "1 Main St",
    phone: "555-1234",
    website: "https://soulkitchen.com",
    category: "restaurants",
    rating: 4.5,
    reviewCount: 120,
    sourceId: "yelp-abc",
    createdAt: new Date(),
  },
  {
    id: "scraped-2",
    scrapeJobId: JOB_ID,
    source: "yelp",
    name: "Corner Grocery",
    address: "2 Main St",
    rating: undefined,
    sourceId: "yelp-def",
    createdAt: new Date(),
  },
];

function makeContext(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/pending-businesses/import/job/${JOB_ID}`, {
    method: "POST",
  });
}

describe("POST /api/pending-businesses/import/job/[jobId]", () => {
  let mockClient: {
    query: jest.Mock;
    release: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue(mockClient) });
    (initializeScrapedBusinessSchema as jest.Mock).mockResolvedValue(undefined);
    (initializePendingImportSchema as jest.Mock).mockResolvedValue(undefined);
    (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue(mockScraped);
    // dedupe query: no existing pending businesses
    mockClient.query.mockResolvedValue({ rows: [] });
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 2,
      succeeded: 2,
      failed: 0,
      results: [],
      errors: [],
    });
  });

  it("should import all scraped businesses when none exist in the queue", async () => {
    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.imported).toBe(2);
    expect(json.skipped).toBe(0);

    expect(importNormalizedBusinesses).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      JOB_ID
    );

    const normalized = (importNormalizedBusinesses as jest.Mock).mock.calls[0][1];
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      name: "Soul Kitchen",
      category_id: "restaurants",
      source: "yelp",
      originalId: "yelp-abc",
    });
    expect(normalized[0].source_data).toMatchObject({
      address: "1 Main St",
      rating: 4.5,
      scrapedBusinessId: "scraped-1",
    });
  });

  it("should skip businesses whose name already exists in the review queue", async () => {
    mockClient.query.mockResolvedValue({ rows: [{ name: "soul kitchen" }] });
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [],
      errors: [],
    });

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.imported).toBe(1);
    expect(json.skipped).toBe(1);

    const normalized = (importNormalizedBusinesses as jest.Mock).mock.calls[0][1];
    expect(normalized).toHaveLength(1);
    expect(normalized[0].name).toBe("Corner Grocery");
  });

  it("should reject invalid job id format", async () => {
    const response = await POST(makeRequest(), makeContext("not-a-uuid"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe("INVALID_ID");
  });

  it("should return 404 when the job does not exist", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue(undefined);

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });

  it("should reject jobs that are not completed", async () => {
    (findScrapeJobById as jest.Mock).mockResolvedValue({ id: JOB_ID, status: "running" });

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe("JOB_NOT_COMPLETED");
    expect(importNormalizedBusinesses).not.toHaveBeenCalled();
  });

  it("should return empty success when the job has no scraped businesses", async () => {
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([]);

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.total).toBe(0);
    expect(importNormalizedBusinesses).not.toHaveBeenCalled();
  });

  it("should return 500 on unexpected errors", async () => {
    (findScrapeJobById as jest.Mock).mockRejectedValue(new Error("db down"));

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
