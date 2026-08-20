/**
 * Businesses API Route Tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findBusinessesWithFilter } from "@/lib/db/business-repository";
import { GET } from "./route";

// Mock dependencies
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/business-repository", () => ({
  findBusinessesWithFilter: jest.fn(),
}));

describe("Businesses API", () => {
  const mockPool = {
    connect: jest.fn(),
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe("GET /api/businesses", () => {
    it("should return all businesses with default pagination", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [
          {
            id: "biz-1",
            ownerId: "owner-1",
            name: "Test Business",
            description: "A test business",
            categoryId: "food-dining",
            verificationStatus: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.businesses).toHaveLength(1);
      expect(json.data.pagination.total).toBe(1);
    });

    it("should search businesses by name", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?search=restaurant",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await GET(mockRequest);

      expect(findBusinessesWithFilter).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ search: "restaurant" })
      );
    });

    it("should filter by status", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?status=pending",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await GET(mockRequest);

      expect(findBusinessesWithFilter).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ status: "pending" })
      );
    });

    it("should filter by approved status", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?status=approved",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await GET(mockRequest);

      expect(findBusinessesWithFilter).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ status: "approved" })
      );
    });

    it("should filter by rejected status", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?status=rejected",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await GET(mockRequest);

      expect(findBusinessesWithFilter).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ status: "rejected" })
      );
    });

    it("should apply custom pagination", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?page=2&limit=50",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [],
        total: 100,
        page: 2,
        limit: 50,
        totalPages: 2,
      });

      await GET(mockRequest);

      expect(findBusinessesWithFilter).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ page: 2, limit: 50 })
      );
    });

    it("should combine search and status filters", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?search=cafe&status=pending",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await GET(mockRequest);

      expect(findBusinessesWithFilter).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ search: "cafe", status: "pending" })
      );
    });

    it("should combine all filters", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?search=restaurant&status=approved&page=1&limit=10",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await GET(mockRequest);

      expect(findBusinessesWithFilter).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          search: "restaurant",
          status: "approved",
          page: 1,
          limit: 10,
        })
      );
    });

    it("should reject invalid page number", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?page=0",
      } as unknown as NextRequest;

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid pagination parameters");
    });

    it("should reject invalid limit", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?limit=101",
      } as unknown as NextRequest;

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid pagination parameters");
    });

    it("should reject invalid status", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses?status=invalid",
      } as unknown as NextRequest;

      const response = await GET(mockRequest);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid status");
    });

    it("should handle database errors", async () => {
      const mockRequest = {
        url: "http://localhost:3000/api/businesses",
      } as unknown as NextRequest;

      (findBusinessesWithFilter as jest.Mock).mockRejectedValue(
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
