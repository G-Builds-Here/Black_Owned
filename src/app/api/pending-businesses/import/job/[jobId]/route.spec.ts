/**
 * POST /api/pending-businesses/import/job/[jobId] tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import {
  findScrapedBusinessesByJobId,
  findScrapedCandidatesForDedup,
} from "@/lib/db/scraped-business-repository";
import {
  importNormalizedBusinesses,
} from "@/lib/db/pending-import-business-repository";
import {
  findBusinessNames,
} from "@/lib/db/business-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import { POST } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/scrape-job-repository", () => ({
  findScrapeJobById: jest.fn(),
}));

jest.mock("@/lib/db/scraped-business-repository", () => ({
  findScrapedBusinessesByJobId: jest.fn(),
  findScrapedCandidatesForDedup: jest.fn(),
}));

jest.mock("@/lib/db/pending-import-business-repository", () => ({
  importNormalizedBusinesses: jest.fn(),
}));

jest.mock("@/lib/db/business-repository", () => ({
  findBusinessNames: jest.fn(),
}));

jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

const AUTH_OK = {
  authenticated: true,
  user: { userId: "u-admin", email: "admin@example.com", role: "admin" },
  statusCode: 200,
};
const AUTH_FAIL = {
  authenticated: false,
  errorType: "NO_AUTH_HEADER",
  errorMessage: "Authorization header is required",
  statusCode: 401,
};

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
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_OK));
    (createAuthErrorResponse as jest.Mock).mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue(mockClient) });
    (findBusinessNames as jest.Mock).mockResolvedValue([]);
    (findScrapedCandidatesForDedup as jest.Mock).mockResolvedValue([]);
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
    delete process.env.DUPLICATE_NAME_THRESHOLD;
    delete process.env.DUPLICATE_ADDRESS_THRESHOLD;
  });

  it("returns 401 when the request is not authenticated as admin", async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_FAIL));
    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("should import all scraped businesses when none exist anywhere", async () => {
    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.imported).toBe(2);
    expect(json.data.skipped).toBe(0);
    expect(json.data.duplicates).toEqual([]);

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
    mockClient.query.mockResolvedValue({ rows: [{ name: "soul kitchen", source_data: null }] });
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
    expect(json.data.imported).toBe(1);
    expect(json.data.skipped).toBe(1);
    expect(json.data.duplicates).toEqual([
      { name: "Soul Kitchen", matchedName: "soul kitchen", matchSource: "queue" },
    ]);

    const normalized = (importNormalizedBusinesses as jest.Mock).mock.calls[0][1];
    expect(normalized).toHaveLength(1);
    expect(normalized[0].name).toBe("Corner Grocery");
  });

  it("should skip a fuzzy name/address match against a previously scraped business", async () => {
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([
      {
        id: "scraped-1",
        scrapeJobId: JOB_ID,
        source: "google",
        name: "Soul Kitchen Bar Grill & Events",
        address: "123 Peachtree St",
        sourceId: "g-1",
        createdAt: new Date(),
      },
    ]);
    (findScrapedCandidatesForDedup as jest.Mock).mockResolvedValue([
      {
        id: "scraped-other",
        name: "Soul Kitchen Bar Grill and Events",
        address: "123 Peachtree St",
        phone: undefined,
      },
    ]);
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      errors: [],
    });

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(json.data.imported).toBe(0);
    expect(json.data.skipped).toBe(1);
    expect(json.data.duplicates).toEqual([
      {
        name: "Soul Kitchen Bar Grill & Events",
        matchedName: "Soul Kitchen Bar Grill and Events",
        matchSource: "scraped",
      },
    ]);
    expect(importNormalizedBusinesses).toHaveBeenCalledWith(expect.any(Object), [], JOB_ID);
  });

  it("should skip a business with an identical normalized phone number", async () => {
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([
      {
        id: "scraped-1",
        scrapeJobId: JOB_ID,
        source: "yelp",
        name: "Bluebird Coffee",
        address: "9 Oak Ave",
        phone: "555-867-5309",
        sourceId: "yelp-bird",
        createdAt: new Date(),
      },
    ]);
    mockClient.query.mockResolvedValue({
      rows: [
        {
          name: "Bluebird Cafe",
          source_data: { address: "12 Different Rd", phone: "(555) 867-5309" },
        },
      ],
    });
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      errors: [],
    });

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(json.data.imported).toBe(0);
    expect(json.data.skipped).toBe(1);
    expect(json.data.duplicates).toEqual([
      { name: "Bluebird Coffee", matchedName: "Bluebird Cafe", matchSource: "queue" },
    ]);
  });

  it("should skip an exact name match against the live businesses table", async () => {
    (findBusinessNames as jest.Mock).mockResolvedValue(["Corner Grocery"]);
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [],
      errors: [],
    });

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(json.data.imported).toBe(1);
    expect(json.data.skipped).toBe(1);
    expect(json.data.duplicates).toEqual([
      { name: "Corner Grocery", matchedName: "Corner Grocery", matchSource: "directory" },
    ]);

    const normalized = (importNormalizedBusinesses as jest.Mock).mock.calls[0][1];
    expect(normalized).toHaveLength(1);
    expect(normalized[0].name).toBe("Soul Kitchen");
  });

  it("should import only the first of two same-job rows with the same name", async () => {
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([
      {
        id: "dup-1",
        scrapeJobId: JOB_ID,
        source: "yelp",
        name: "Dup Diner",
        address: "1 A St",
        sourceId: "yelp-d1",
        createdAt: new Date(),
      },
      {
        id: "dup-2",
        scrapeJobId: JOB_ID,
        source: "google",
        name: "Dup Diner",
        address: "2 B St",
        sourceId: "g-d2",
        createdAt: new Date(),
      },
    ]);
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [],
      errors: [],
    });

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    expect(json.data.imported).toBe(1);
    expect(json.data.skipped).toBe(1);
    expect(json.data.duplicates).toEqual([
      { name: "Dup Diner", matchedName: "Dup Diner", matchSource: "scraped" },
    ]);

    const normalized = (importNormalizedBusinesses as jest.Mock).mock.calls[0][1];
    expect(normalized).toHaveLength(1);
    expect(normalized[0].originalId).toBe("yelp-d1");
  });

  it("should respect the DUPLICATE_NAME_THRESHOLD env override", async () => {
    // Name similarity for this pair is ~0.69 (below the 0.8 default),
    // addresses are identical (1.0, above the 0.85 default).
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([
      {
        id: "scraped-1",
        scrapeJobId: JOB_ID,
        source: "yelp",
        name: "Blackbird Cafe",
        address: "500 Peachtree St",
        sourceId: "yelp-bb",
        createdAt: new Date(),
      },
    ]);
    (findScrapedCandidatesForDedup as jest.Mock).mockResolvedValue([
      {
        id: "scraped-other",
        name: "Blackbird Cafes",
        address: "500 Peachtree St",
        phone: undefined,
      },
    ]);
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [],
      errors: [],
    });

    const defaultResponse = await POST(makeRequest(), makeContext(JOB_ID));
    const defaultJson = await defaultResponse.json();
    expect(defaultJson.data.imported).toBe(1);
    expect(defaultJson.data.skipped).toBe(0);

    process.env.DUPLICATE_NAME_THRESHOLD = "0.5";
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      errors: [],
    });

    const loweredResponse = await POST(makeRequest(), makeContext(JOB_ID));
    const loweredJson = await loweredResponse.json();
    expect(loweredJson.data.imported).toBe(0);
    expect(loweredJson.data.skipped).toBe(1);
    expect(loweredJson.data.duplicates).toEqual([
      {
        name: "Blackbird Cafe",
        matchedName: "Blackbird Cafes",
        matchSource: "scraped",
      },
    ]);
  });

  it("should fall back to defaults when the threshold env value is invalid", async () => {
    (findScrapedBusinessesByJobId as jest.Mock).mockResolvedValue([
      {
        id: "scraped-1",
        scrapeJobId: JOB_ID,
        source: "yelp",
        name: "Blackbird Cafe",
        address: "500 Peachtree St",
        sourceId: "yelp-bb",
        createdAt: new Date(),
      },
    ]);
    (findScrapedCandidatesForDedup as jest.Mock).mockResolvedValue([
      {
        id: "scraped-other",
        name: "Blackbird Cafes",
        address: "500 Peachtree St",
        phone: undefined,
      },
    ]);
    process.env.DUPLICATE_NAME_THRESHOLD = "not-a-number";
    (importNormalizedBusinesses as jest.Mock).mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [],
      errors: [],
    });

    const response = await POST(makeRequest(), makeContext(JOB_ID));
    const json = await response.json();

    // ~0.69 name similarity stays below the 0.8 default -> not deduped
    expect(json.data.skipped).toBe(0);
    expect(json.data.duplicates).toEqual([]);
    const normalized = (importNormalizedBusinesses as jest.Mock).mock.calls[0][1];
    expect(normalized).toHaveLength(1);
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
    expect(json.data.total).toBe(0);
    expect(json.data.duplicates).toEqual([]);
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
