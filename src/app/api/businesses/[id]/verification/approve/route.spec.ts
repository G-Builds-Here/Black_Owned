/**
 * Verification Approve API Route Tests
 *
 * Tests for POST /api/businesses/[id]/verification/approve (LOC-0039 AC2)
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
  publishVerificationApproved: jest.fn(),
}));

const { createAuthMiddleware, createAuthErrorResponse } = require("@/lib/auth/jwt-middleware");
const { publishVerificationApproved } = require("@/lib/nats/client");

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

describe("Verification Approve API", () => {
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
    (publishVerificationApproved as jest.Mock).mockResolvedValue(undefined);
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

  describe("POST /api/businesses/[id]/verification/approve", () => {
    it("should return 400 for invalid UUID format - random string", async () => {
      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: "not-a-uuid" }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid business ID format");
      expect(json.code).toBe("INVALID_ID");
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("should return 404 for a non-existent business", async () => {
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
        "SELECT id, verification_status FROM businesses WHERE id = $1",
        [validUuid]
      );
      expect(publishVerificationApproved).not.toHaveBeenCalled();
    });

    it("should return 409 when the business is already verified", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, verification_status: "verified" }],
      });

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Business is already verified");
      expect(json.code).toBe("ALREADY_VERIFIED");
      expect(publishVerificationApproved).not.toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should publish the NATS event and mark the business verified", async () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      // First query: fetch the business
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, verification_status: "unverified" }],
      });

      // Second query: update to verified
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: validUuid, verificationStatus: "verified" });
      expect(publishVerificationApproved).toHaveBeenCalledWith(validUuid);
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        "UPDATE businesses SET verification_status = 'verified' WHERE id = $1",
        [validUuid]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should not update the database when the NATS publish fails", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: validUuid, verification_status: "pending" }],
      });
      (publishVerificationApproved as jest.Mock).mockRejectedValueOnce(new Error("NATS down"));

      const mockRequest = {} as unknown as Request;
      const context = { params: Promise.resolve({ id: validUuid }) };

      const response = await POST(mockRequest, context);
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
