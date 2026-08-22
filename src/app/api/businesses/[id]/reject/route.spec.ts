/**
 * Business Reject API Route Tests
 *
 * Tests for POST /api/businesses/[id]/reject
 */

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { POST } from "./route";

// Mock dependencies
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

const { createAuthMiddleware, createAuthErrorResponse } = require("@/lib/auth/jwt-middleware");

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

describe("Business Reject API", () => {
  const mockPool = {
    connect: jest.fn(),
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_OK));
    (createAuthErrorResponse as jest.Mock).mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
    (getPool as jest.Mock).mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it("returns 401 when the request is not authenticated as admin", async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_FAIL));
    const mockRequest = {} as unknown as Request;
    const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };

    const response = await POST(mockRequest, context);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
  });

  describe("POST /api/businesses/[id]/reject", () => {
    it("should return 400 for invalid UUID format - empty string", async () => {
      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: "" }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid business ID format");
      expect(json.code).toBe("INVALID_ID");
    });

    it("should return 400 for invalid UUID format - random string", async () => {
      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: "not-a-uuid" }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid business ID format");
      expect(json.code).toBe("INVALID_ID");
    });

    it("should return 400 for invalid UUID format - missing dashes", async () => {
      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: "12345678123456781234567812345678" }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid business ID format");
      expect(json.code).toBe("INVALID_ID");
    });

    it("should return 400 for invalid UUID format - wrong length", async () => {
      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: "12345678-1234-1234-1234-12345678901" }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid business ID format");
      expect(json.code).toBe("INVALID_ID");
    });

    it("should return 400 for invalid UUID format - uppercase letters", async () => {
      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: "12345678-1234-1234-1234-1234567890GG" }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid business ID format");
      expect(json.code).toBe("INVALID_ID");
    });

    it("should return 404 for non-existent business", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Business not found");
      expect(json.code).toBe("NOT_FOUND");
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT id, name, status FROM pending_import_businesses WHERE id = $1",
        [validUuid]
      );
    });

    it("should return 400 for business not in pending_review status - approved", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: validUuid,
            name: "Test Business",
            status: "approved",
          },
        ],
      });

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Business is not in pending_review status");
      expect(json.error).toContain("approved");
      expect(json.code).toBe("INVALID_STATUS");
    });

    it("should return 400 for business not in pending_review status - rejected", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: validUuid,
            name: "Test Business",
            status: "rejected",
          },
        ],
      });

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Business is not in pending_review status");
      expect(json.error).toContain("rejected");
      expect(json.code).toBe("INVALID_STATUS");
    });

    it("should successfully reject a business in pending_review status", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      const businessName = "Test Business";

      // First query: check existing business
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: validUuid,
            name: businessName,
            status: "pending_review",
          },
        ],
      });

      // Second query: update to rejected
      const updatedBusiness = {
        id: validUuid,
        name: businessName,
        status: "rejected",
      };
      mockClient.query.mockResolvedValueOnce({
        rows: [updatedBusiness],
      });

      const mockRequest = {
        json: async () => ({ reason: "Not verified as Black-owned" }),
      } as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({
        id: validUuid,
        name: businessName,
        status: "rejected",
        rejection_reason: "Not verified as Black-owned",
      });

      // Verify first query
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        "SELECT id, name, status FROM pending_import_businesses WHERE id = $1",
        [validUuid]
      );

      // Verify second query (update with trimmed reason)
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("UPDATE pending_import_businesses"),
        [validUuid, "Not verified as Black-owned"]
      );

      // Verify client was released
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should trim whitespace from the rejection reason before persisting", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, name: "Test Business", status: "pending_review" }],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, name: "Test Business", status: "rejected" }],
      });

      const mockRequest = {
        json: async () => ({ reason: "  padding check  " }),
      } as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.rejection_reason).toBe("padding check");
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        [validUuid, "padding check"]
      );
    });

    it("should return 400 REASON_REQUIRED when the reason is missing", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, name: "Test Business", status: "pending_review" }],
      });

      const mockRequest = {
        json: async () => ({}),
      } as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.code).toBe("REASON_REQUIRED");
      expect(json.error).toBe("Rejection reason is required");
    });

    it("should return 400 REASON_REQUIRED when the reason is empty or whitespace", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, name: "Test Business", status: "pending_review" }],
      });

      const mockRequest = {
        json: async () => ({ reason: "   " }),
      } as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.code).toBe("REASON_REQUIRED");
    });

    it("should return 400 REASON_REQUIRED when the request has no JSON body", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, name: "Test Business", status: "pending_review" }],
      });

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.code).toBe("REASON_REQUIRED");
    });

    it("should return 400 REASON_TOO_LONG when the reason exceeds 500 characters", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, name: "Test Business", status: "pending_review" }],
      });

      const mockRequest = {
        json: async () => ({ reason: "x".repeat(501) }),
      } as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.code).toBe("REASON_TOO_LONG");
      expect(json.error).toContain("500 characters");
    });

    it("should handle database errors gracefully", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      mockClient.query.mockRejectedValueOnce(new Error("Database connection failed"));

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should update database status correctly to rejected", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: validUuid,
            name: "Test Business",
            status: "pending_review",
          },
        ],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: validUuid,
            name: "Test Business",
            status: "rejected",
          },
        ],
      });

      const mockRequest = {
        json: async () => ({ reason: "duplicate listing" }),
      } as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      await POST(mockRequest, context);

      // Verify the update query includes status, reason and updated_at
      const secondCall = (mockClient.query as jest.Mock).mock.calls[1];
      expect(secondCall[0]).toContain("SET status = 'rejected'");
      expect(secondCall[0]).toContain("rejection_reason = $2");
      expect(secondCall[0]).toContain("updated_at = NOW()");
      expect(secondCall[1]).toEqual([validUuid, "duplicate listing"]);
    });

    it("should handle valid UUID with uppercase letters (case-insensitive validation)", async () => {
      const validUuid = "550E8400-E29B-41D4-A716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: validUuid,
            name: "Test Business",
            status: "pending_review",
          },
        ],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: validUuid,
            name: "Test Business",
            status: "rejected",
          },
        ],
      });

      const mockRequest = {
        json: async () => ({ reason: "case check" }),
      } as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });
});
