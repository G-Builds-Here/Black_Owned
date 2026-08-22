/**
 * Review Moderation API Route Tests
 *
 * Tests for POST /api/reviews/[id]/moderate (LOC-0037 AC4)
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

describe("Review Moderation API", () => {
  const mockPool = {
    connect: jest.fn(),
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  function makeRequest(body?: unknown) {
    return { json: jest.fn().mockResolvedValue(body) } as unknown as Request;
  }

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
    const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };

    const response = await POST(makeRequest({ action: "hide" }), context);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
  });

  describe("POST /api/reviews/[id]/moderate", () => {
    it("should return 400 for invalid UUID format", async () => {
      const context = { params: Promise.resolve({ id: "not-a-uuid" }) };

      const response = await POST(makeRequest({ action: "hide" }), context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid review ID format");
      expect(json.code).toBe("INVALID_ID");
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it.each([undefined, "delete", "APPROVE", true])(
      "should return 400 for an action that is not approve or hide (%p)",
      async (action) => {
        const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
        const body = action === undefined ? {} : { action };

        const response = await POST(makeRequest(body), context);
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.success).toBe(false);
        expect(json.error).toBe("Invalid moderation action. Must be approve or hide.");
        expect(json.code).toBe("INVALID_ACTION");
        expect(mockClient.query).not.toHaveBeenCalled();
      }
    );

    it("should hide a review when the action is hide", async () => {
      const reviewId = "11111111-1111-4111-8111-111111111111";
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: reviewId, visible: false }],
      });
      const context = { params: Promise.resolve({ id: reviewId }) };

      const response = await POST(makeRequest({ action: "hide" }), context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: reviewId, visible: false });
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE reviews"),
        [reviewId, false]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should restore a review when the action is approve", async () => {
      const reviewId = "11111111-1111-4111-8111-111111111111";
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: reviewId, visible: true }],
      });
      const context = { params: Promise.resolve({ id: reviewId }) };

      const response = await POST(makeRequest({ action: "approve" }), context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.visible).toBe(true);
      expect(mockClient.query.mock.calls[0][1]).toEqual([reviewId, true]);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should return 404 for a non-existent review", async () => {
      const reviewId = "11111111-1111-4111-8111-111111111111";
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const context = { params: Promise.resolve({ id: reviewId }) };

      const response = await POST(makeRequest({ action: "hide" }), context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Review not found");
      expect(json.code).toBe("NOT_FOUND");
    });

    it("should handle database errors gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const reviewId = "11111111-1111-4111-8111-111111111111";
      mockClient.query.mockRejectedValueOnce(new Error("Database connection failed"));
      const context = { params: Promise.resolve({ id: reviewId }) };

      const response = await POST(makeRequest({ action: "hide" }), context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
      expect(mockClient.release).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
