/**
 * Review Creation API Route Tests
 *
 * Tests for POST /api/reviews (on-site review write path)
 */

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { POST } from "./route";

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
  user: { userId: "u-1", email: "user@example.com", role: "user" },
  statusCode: 200,
};
const AUTH_FAIL = {
  authenticated: false,
  errorType: "NO_AUTH_HEADER",
  errorMessage: "Authorization header is required",
  statusCode: 401,
};

const BIZ_ID = "22222222-2222-4222-8222-222222222222";
const REVIEW_ID = "33333333-3333-4333-8333-333333333333";

describe("Review Creation API", () => {
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

  it("returns 401 when the request is not authenticated", async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_FAIL));

    const response = await POST(
      makeRequest({ businessId: BIZ_ID, rating: 5, comment: "Great place" })
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("returns 400 when businessId is not a valid UUID", async () => {
    const response = await POST(
      makeRequest({ businessId: "not-a-uuid", rating: 5, comment: "Great place" })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it.each([[0], [6], ["five"], [null]])(
    "returns 400 when rating is out of range (%p)",
    async (rating) => {
      const response = await POST(
        makeRequest({ businessId: BIZ_ID, rating, comment: "Great place" })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.code).toBe("VALIDATION_ERROR");
      expect(mockClient.query).not.toHaveBeenCalled();
    }
  );

  it("returns 400 when comment is missing", async () => {
    const response = await POST(makeRequest({ businessId: BIZ_ID, rating: 5 }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("returns 400 when comment is blank", async () => {
    const response = await POST(
      makeRequest({ businessId: BIZ_ID, rating: 5, comment: "   " })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("returns 404 when the business does not exist", async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const response = await POST(
      makeRequest({ businessId: BIZ_ID, rating: 5, comment: "Great place" })
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe("NOT_FOUND");
  });

  it("returns 400 when locationId does not belong to the business", async () => {
    const locationId = "44444444-4444-4444-8444-444444444444";
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: BIZ_ID }] });
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const response = await POST(
      makeRequest({ businessId: BIZ_ID, rating: 5, comment: "Great place", locationId })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Location does not belong to this business");
    expect(mockClient.query).toHaveBeenCalledTimes(2);
  });

  it("creates a visible review and returns 201", async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: BIZ_ID }] });
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: REVIEW_ID,
          rating: 5,
          comment: "Great place",
          visible: true,
          created_at: "2026-08-26T12:00:00Z",
        },
      ],
    });

    const response = await POST(
      makeRequest({ businessId: BIZ_ID, rating: 5, comment: "Great place" })
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      id: REVIEW_ID,
      rating: 5,
      comment: "Great place",
      visible: true,
      createdAt: "2026-08-26T12:00:00Z",
    });
    expect(mockClient.query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO reviews"),
      [BIZ_ID, "u-1", 5, "Great place", null]
    );
    expect(mockClient.release).toHaveBeenCalled();
  });
});
