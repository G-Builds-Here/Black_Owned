/**
 * Verification Reject API Route Tests
 *
 * Tests for POST /api/businesses/[id]/verification/reject (LOC-0039 AC3)
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

jest.mock("@/lib/nats/client", () => ({
  publishVerificationRejected: jest.fn(),
}));

const { createAuthMiddleware, createAuthErrorResponse } = require("@/lib/auth/jwt-middleware");
const { publishVerificationRejected } = require("@/lib/nats/client");

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

describe("Verification Reject API", () => {
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
    (publishVerificationRejected as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when the request is not authenticated as admin", async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_FAIL));
    const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };

    const response = await POST(makeRequest({ reason: "fake address" }), context);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
  });

  describe("POST /api/businesses/[id]/verification/reject", () => {
    it("should return 400 for invalid UUID format - random string", async () => {
      const context = { params: Promise.resolve({ id: "not-a-uuid" }) };

      const response = await POST(makeRequest({ reason: "fake address" }), context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid business ID format");
      expect(json.code).toBe("INVALID_ID");
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it.each([undefined, {}, { reason: "   " }, { reason: 42 }])(
      "should return 400 when the rejection reason is missing or not a non-blank string (%p)",
      async (body) => {
        const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };

        const response = await POST(makeRequest(body), context);
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.success).toBe(false);
        expect(json.error).toBe("Rejection reason is required");
        expect(json.code).toBe("VALIDATION");
        expect(mockClient.query).not.toHaveBeenCalled();
        expect(publishVerificationRejected).not.toHaveBeenCalled();
      }
    );

    it("should return 404 for a non-existent business", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(makeRequest({ reason: "fake address" }), context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Business not found");
      expect(json.code).toBe("NOT_FOUND");
      expect(publishVerificationRejected).not.toHaveBeenCalled();
    });

    it("should publish the NATS event with the trimmed reason and mark the business rejected", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      // First query: fetch the business
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: validUuid }] });

      // Second query: update to rejected
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(makeRequest({ reason: "  fake address  " }), context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: validUuid, verificationStatus: "rejected" });
      expect(publishVerificationRejected).toHaveBeenCalledWith(validUuid, "fake address");
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        "UPDATE businesses SET verification_status = 'rejected' WHERE id = $1",
        [validUuid]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should not update the database when the NATS publish fails", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({ rows: [{ id: validUuid }] });
      (publishVerificationRejected as jest.Mock).mockRejectedValueOnce(new Error("NATS down"));

      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(makeRequest({ reason: "fake address" }), context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
      // Publish happens before the update, so a publish failure must not run it
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.release).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
