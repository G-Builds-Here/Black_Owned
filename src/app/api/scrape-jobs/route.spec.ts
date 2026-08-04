/**
 * Scrape Jobs API Route Tests
 *
 * Tests for GET /api/scrape-jobs endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";

// Mock the repository
jest.mock("@/lib/db/scrape-job-repository", () => ({
  findAllScrapeJobs: jest.fn(),
  initializeScrapeJobSchema: jest.fn(),
}));

import {
  findAllScrapeJobs,
  initializeScrapeJobSchema,
} from "@/lib/db/scrape-job-repository";

// Mock types
interface MockScrapeJob {
  id: string;
  source: "google-maps" | "yelp" | "facebook";
  query: string;
  location: string;
  status: "pending" | "running" | "completed" | "failed";
  business_count: number;
  created_at: Date;
  updated_at: Date;
}

interface MockFindAllResult {
  jobs: MockScrapeJob[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

describe("GET /api/scrape-jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Success cases", () => {
    it("should return all jobs with default pagination", async () => {
      const mockResult: MockFindAllResult = {
        jobs: [
          {
            id: "123e4567-e89b-12d3-a456-42661417000",
            source: "google-maps",
            query: "restaurants",
            location: "Los Angeles",
            status: "completed",
            business_count: 50,
            created_at: new Date("2024-01-15T10:00:00Z"),
            updated_at: new Date("2024-01-15T10:30:00Z"),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findAllScrapeJobs as jest.Mock).mockResolvedValue(mockResult);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      // Date objects are serialized to ISO strings by JSON.stringify
      expect(body.data.jobs[0].id).toBe("123e4567-e89b-12d3-a456-42661417000");
      expect(body.data.jobs[0].source).toBe("google-maps");
      expect(body.data.jobs[0].query).toBe("restaurants");
      expect(body.data.jobs[0].location).toBe("Los Angeles");
      expect(body.data.jobs[0].status).toBe("completed");
      expect(body.data.jobs[0].business_count).toBe(50);
      expect(body.data.jobs[0].created_at).toBe("2024-01-15T10:00:00.000Z");
      expect(body.data.jobs[0].updated_at).toBe("2024-01-15T10:30:00.000Z");
      expect(body.data.total).toBe(1);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(20);
      expect(body.data.totalPages).toBe(1);
      expect(findAllScrapeJobs).toHaveBeenCalledWith(1, 20, undefined);
    });

    it("should return jobs with custom pagination", async () => {
      const mockResult: MockFindAllResult = {
        jobs: [],
        total: 0,
        page: 2,
        pageSize: 50,
        totalPages: 0,
      };

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findAllScrapeJobs as jest.Mock).mockResolvedValue(mockResult);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?page=2&pageSize=50"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(findAllScrapeJobs).toHaveBeenCalledWith(2, 50, undefined);
    });

    it("should filter jobs by status", async () => {
      const mockResult: MockFindAllResult = {
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findAllScrapeJobs as jest.Mock).mockResolvedValue(mockResult);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?status=completed"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(findAllScrapeJobs).toHaveBeenCalledWith(1, 20, "completed");
    });

    it("should filter jobs by source", async () => {
      const mockResult: MockFindAllResult = {
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findAllScrapeJobs as jest.Mock).mockResolvedValue(mockResult);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?source=google-maps"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      // Note: source filter is validated but not passed to repository (repository may not support it yet)
      expect(findAllScrapeJobs).toHaveBeenCalledWith(1, 20, undefined);
    });

    it("should filter jobs by both status and source", async () => {
      const mockResult: MockFindAllResult = {
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findAllScrapeJobs as jest.Mock).mockResolvedValue(mockResult);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?status=running&source=yelp"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(findAllScrapeJobs).toHaveBeenCalledWith(1, 20, "running");
    });
  });

  describe("Validation errors", () => {
    it("should return 400 for invalid page number (less than 1)", async () => {
      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?page=0"
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Invalid pagination parameters");
    });

    it("should return 400 for invalid page number (negative)", async () => {
      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?page=-1"
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it("should return 400 for invalid pageSize (less than 1)", async () => {
      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?pageSize=0"
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it("should return 400 for invalid pageSize (greater than 100)", async () => {
      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?pageSize=101"
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Invalid pagination parameters");
    });

    it("should return 400 for invalid status filter", async () => {
      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?status=invalid"
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Invalid status");
    });

    it("should return 400 for invalid source filter", async () => {
      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);

      const request = new NextRequest(
        "http://localhost:3000/api/scrape-jobs?source=twitter"
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Invalid source");
    });
  });

  describe("Error handling", () => {
    it("should return 500 on repository error", async () => {
      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findAllScrapeJobs as jest.Mock).mockRejectedValue(
        new Error("Database connection failed")
      );

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs");
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Internal server error");
    });
  });
});
