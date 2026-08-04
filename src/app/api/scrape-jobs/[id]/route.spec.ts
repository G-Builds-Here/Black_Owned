/**
 * Scrape Job Route Tests
 */

import { NextRequest, NextResponse } from "next/server";
import { GET, DELETE } from "./route";
import {
  findScrapeJobById,
  deleteScrapeJob,
  ScrapeJob,
} from "@/lib/db/scrape-job-repository";

// Mock auth middleware
jest.mock("@/lib/auth/auth-middleware", () => {
  return {
    requireAuth: jest.fn((handler) => async (req: any, res: any) => {
      // Inject a mock admin user for testing
      if (!req.user) {
        req.user = { id: "test-user", role: "admin" };
      }
      return handler(req, res);
    }),
  };
});

// Mock database functions
jest.mock("@/lib/db/scrape-job-repository", () => ({
  findScrapeJobById: jest.fn(),
  deleteScrapeJob: jest.fn(),
}));

describe("ScrapeJobRoute", () => {
  const mockJob: ScrapeJob = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    source: "google-maps",
    query: "test query",
    location: "test location",
    status: "completed",
    business_count: 5,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-02T00:00:00Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/scrape-jobs/[id]", () => {
    it("should return a scrape job by ID", async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id);
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(mockJob.id);
      expect(json.data.source).toBe("google-maps");
      expect(json.data.status).toBe("completed");
      expect(json.data.business_count).toBe(5);
      expect(json.data.created_at).toBe("2024-01-01T00:00:00.000Z");
      expect(json.data.updated_at).toBe("2024-01-02T00:00:00.000Z");
    });

    it("should return 404 for non-existent job", async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(null);

      const fakeId = "00000000-0000-0000-0000-000000000000";
      const request = new NextRequest("http://localhost:3000/scrape-jobs/" + fakeId);
      const context = { params: Promise.resolve({ id: fakeId }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Scrape job not found");
    });

    it("should return 400 for invalid UUID format", async () => {
      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/invalid-uuid");
      const context = { params: Promise.resolve({ id: "invalid-uuid" }) };

      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid job ID format");
    });
  });

  describe("DELETE /api/scrape-jobs/[id]", () => {
    it("should delete a scrape job successfully", async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);
      (deleteScrapeJob as jest.Mock).mockResolvedValue(true);

      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + mockJob.id, {
        method: "DELETE",
      });
      const context = { params: Promise.resolve({ id: mockJob.id }) };

      const response = await DELETE(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe("Scrape job deleted successfully");
    });

    it("should return 404 when trying to delete non-existent job", async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(null);

      const fakeId = "00000000-0000-0000-0000-000000000000";
      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/" + fakeId, {
        method: "DELETE",
      });
      const context = { params: Promise.resolve({ id: fakeId }) };

      const response = await DELETE(request, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Scrape job not found");
    });

    it("should return 400 for invalid UUID format", async () => {
      const request = new NextRequest("http://localhost:3000/api/scrape-jobs/invalid-uuid", {
        method: "DELETE",
      });
      const context = { params: Promise.resolve({ id: "invalid-uuid" }) };

      const response = await DELETE(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid job ID format");
    });
  });
});
