/**
 * Scrape Job Results Route Tests
 */

import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import { findBusinessesByJobId } from "@/lib/db/pending-import-business-repository";

// Mock database functions
jest.mock("@/lib/db/scrape-job-repository", () => ({
  findScrapeJobById: jest.fn(),
}));

jest.mock("@/lib/db/pending-import-business-repository", () => ({
  findBusinessesByJobId: jest.fn(),
}));

// Mock getPool
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(() => ({
    connect: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn(),
    })),
  })),
}));

describe("GET /api/scrape-jobs/:id/results", () => {
  const mockJob = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    source: "google-maps",
    query: "restaurants",
    location: "Los Angeles",
    status: "completed",
    resultCount: 5,
    errorMessage: undefined,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
  };

  const mockBusinesses = [
    {
      id: "biz-1",
      name: "Test Restaurant",
      job_id: mockJob.id,
      created_at: "2024-01-01T00:00:00.000Z",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Success cases", () => {
    it("should return scraped businesses for a completed job", async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
      (findBusinessesByJobId as jest.Mock).mockResolvedValue(mockBusinesses);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id + "/results");
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBe(mockJob.id);
      expect(json.data.status).toBe("completed");
      expect(json.data.businessCount).toBe(1);
      expect(json.data.businesses).toEqual(mockBusinesses);
    });

    it("should return empty businesses array when job has no results", async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
      (findBusinessesByJobId as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id + "/results");
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.businessCount).toBe(0);
      expect(json.data.businesses).toEqual([]);
    });
  });

  describe("Error cases", () => {
    it("should return 404 when job is not found", async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(null);

      const fakeId = "00000000-0000-0000-0000-000000000000";
      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + fakeId + "/results");
      const context = { params: Promise.resolve({ id: fakeId }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Scrape job not found");
      expect(json.code).toBe("NOT_FOUND");
    });

    it("should return 400 when job is not completed", async () => {
      const runningJob = {
        ...mockJob,
        status: "running",
      };
      (findScrapeJobById as jest.Mock).mockResolvedValue(runningJob);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id + "/results");
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Job is not completed");
      expect(json.code).toBe("NOT_COMPLETED");
      expect(json.status).toBe("running");
    });

    it("should return 400 when job is pending", async () => {
      const pendingJob = {
        ...mockJob,
        status: "pending",
      };
      (findScrapeJobById as jest.Mock).mockResolvedValue(pendingJob);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id + "/results");
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Job is not completed");
    });

    it("should return 400 when job is failed", async () => {
      const failedJob = {
        ...mockJob,
        status: "failed",
      };
      (findScrapeJobById as jest.Mock).mockResolvedValue(failedJob);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id + "/results");
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Job is not completed");
    });

    it("should return 400 when job is cancelled", async () => {
      const cancelledJob = {
        ...mockJob,
        status: "cancelled",
      };
      (findScrapeJobById as jest.Mock).mockResolvedValue(cancelledJob);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id + "/results");
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Job is not completed");
    });

    it("should return 400 for invalid UUID format", async () => {
      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/invalid-uuid/results");
      const context = { params: Promise.resolve({ id: "invalid-uuid" }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid job ID format");
      expect(json.code).toBe("INVALID_ID");
    });

    it("should return 500 on database error", async () => {
      (findScrapeJobById as jest.Mock).mockRejectedValue(new Error("Database connection failed"));

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id + "/results");
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });
  });
});
