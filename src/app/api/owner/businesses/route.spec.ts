/**
 * GET /api/owner/businesses tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { createAuthErrorResponse } from "@/lib/auth/jwt-middleware";
import { GET } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

import { createAuthMiddleware } from "@/lib/auth/jwt-middleware";

const mockedGetPool = jest.mocked(getPool);
const mockedCreateAuth = jest.mocked(createAuthMiddleware);
const mockedAuthError = jest.mocked(createAuthErrorResponse);

const AUTH_OK = {
  authenticated: true,
  user: { userId: "u-1", email: "owner@example.com", role: "user" },
  statusCode: 200,
};
const AUTH_FAIL = {
  authenticated: false,
  errorType: "NO_AUTH_HEADER",
  errorMessage: "Authorization header is required",
  statusCode: 401,
};

function mockPoolClient(query: jest.Mock) {
  mockedGetPool.mockReturnValue({
    connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }),
  } as unknown as ReturnType<typeof getPool>);
}

describe("GET /api/owner/businesses", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_OK) as never);
    mockedAuthError.mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);

    const res = await GET(new NextRequest("http://localhost/api/owner/businesses"));
    expect(res.status).toBe(401);
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("lists the user's businesses with category display names", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          id: "b-1",
          name: "Soul Kitchen",
          description: "Southern soul food",
          category: "Food & Dining",
          status: "unverified",
          createdAt: new Date("2026-08-10T00:00:00Z"),
        },
        {
          id: "b-2",
          name: "Heritage Barbering",
          description: null,
          category: "Personal Services",
          status: "verified",
          createdAt: new Date("2026-08-12T00:00:00Z"),
        },
      ],
    });
    mockPoolClient(query);

    const res = await GET(new NextRequest("http://localhost/api/owner/businesses"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.businesses).toHaveLength(2);
    expect(body.data.businesses[0].name).toBe("Soul Kitchen");
    expect(body.data.businesses[0].category).toBe("Food & Dining");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE b.owner_id = $1"),
      ["u-1"]
    );
  });

  it("returns an empty list when the user owns no businesses", async () => {
    mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));

    const res = await GET(new NextRequest("http://localhost/api/owner/businesses"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.businesses).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));

    const res = await GET(new NextRequest("http://localhost/api/owner/businesses"));
    expect(res.status).toBe(500);
  });
});
