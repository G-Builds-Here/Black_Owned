/**
 * Scrape Jobs API Route Tests
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createScrapeJob,
  findScrapeJobs,
  initializeScrapeJobSchema,
} from "@/lib/db/scrape-job-repository";
import { validateScrapeJobInput } from "@/types/scrape-job";
import { POST, GET } from "./route";

// The route opens its own client via getPool().connect() and passes it to the
// repo functions. Mock the pool so no live Postgres is needed. `mock`-prefixed
// so the hoisted jest.mock factory may reference the pool/client.
const mockDbClient = { release: jest.fn() };
const mockDbPool = { connect: jest.fn().mockResolvedValue(mockDbClient) };

// Mock dependencies
jest.mock("@/lib/db/scrape-job-repository", () => ({
  initializeScrapeJobSchema: jest.fn(),
  createScrapeJob: jest.fn(),
  findScrapeJobs: jest.fn(),
}));

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(() => mockDbPool),
}));

jest.mock("@/types/scrape-job", () => ({
  validateScrapeJobInput: jest.fn(),
  isValidScrapeJobStatus: jest.fn(() => true),
}));

describe("Scrape Jobs API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/jobs", () => {
    it("should create a scrape job with valid input", async () => {
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          source: "google-maps",
          query: "black owned restaurants",
          location: "New York, NY",
        }),
      } as unknown as NextRequest;

      (validateScrapeJobInput as jest.Mock).mockReturnValue({
        valid: true,
        errors: [],
      });

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (createScrapeJob as jest.Mock).mockResolvedValue({
        id: "test-id-123",
        source: "google-maps",
        query: "black owned restaurants",
        location: "New York, NY",
        status: "pending",
        created_at: new Date(),
      });

      const response = await POST(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("test-id-123");
      expect(json.data.status).toBe("pending");
      expect(json.message).toBe("Scrape job created successfully");
    });

    it("should reject request with missing source", async () => {
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          query: "test query",
          location: "test location",
        }),
      } as unknown as NextRequest;

      (validateScrapeJobInput as jest.Mock).mockReturnValue({
        valid: false,
        errors: ["Missing required field: source"],
      });

      const response = await POST(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.errors).toContain("Missing required field: source");
    });

    it("should reject request with missing query", async () => {
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          source: "google-maps",
          location: "test location",
        }),
      } as unknown as NextRequest;

      (validateScrapeJobInput as jest.Mock).mockReturnValue({
        valid: false,
        errors: ["Missing required field: query"],
      });

      const response = await POST(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.errors).toContain("Missing required field: query");
    });

    it("should reject request with missing location", async () => {
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          source: "google-maps",
          query: "test query",
        }),
      } as unknown as NextRequest;

      (validateScrapeJobInput as jest.Mock).mockReturnValue({
        valid: false,
        errors: ["Missing required field: location"],
      });

      const response = await POST(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.errors).toContain("Missing required field: location");
    });

    it("should handle database errors", async () => {
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          source: "google-maps",
          query: "test query",
          location: "test location",
        }),
      } as unknown as NextRequest;

      (validateScrapeJobInput as jest.Mock).mockReturnValue({
        valid: true,
        errors: [],
      });

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (createScrapeJob as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await POST(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });
  });

  describe("GET /api/jobs", () => {
    it("should return paginated scrape jobs", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/jobs?page=1&pageSize=20",
      } as unknown as NextRequest;

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findScrapeJobs as jest.Mock).mockResolvedValue({
        jobs: [
          {
            id: "job-1",
            source: "google-maps",
            query: "test 1",
            location: "location 1",
            status: "pending",
            business_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.jobs).toHaveLength(1);
      expect(json.data.total).toBe(1);
    });

    it("should filter by status when provided", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/jobs?page=1&pageSize=20&status=completed",
      } as unknown as NextRequest;

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findScrapeJobs as jest.Mock).mockResolvedValue({
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      await GET(mockRequest);

      // Route calls findScrapeJobs(client, status, pageSize).
      expect(findScrapeJobs).toHaveBeenCalledWith(mockDbClient, "completed", 20);
    });

    it("should use default pagination when not provided", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/jobs",
      } as unknown as NextRequest;

      (initializeScrapeJobSchema as jest.Mock).mockResolvedValue(undefined);
      (findScrapeJobs as jest.Mock).mockResolvedValue({
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      await GET(mockRequest);

      // Route calls findScrapeJobs(client, status, pageSize) with defaults.
      expect(findScrapeJobs).toHaveBeenCalledWith(mockDbClient, undefined, 20);
    });

    it("should reject invalid page numbers", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/jobs?page=0&pageSize=20",
      } as unknown as NextRequest;

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid pagination parameters");
    });

    it("should reject pageSize > 100", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/jobs?page=1&pageSize=101",
      } as unknown as NextRequest;

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid pagination parameters");
    });

    it("should handle database errors", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/jobs",
      } as unknown as NextRequest;

      (initializeScrapeJobSchema as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });
  });
});
