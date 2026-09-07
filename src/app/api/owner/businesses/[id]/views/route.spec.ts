/**
 * GET /api/owner/businesses/[id]/views tests
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

const BIZ_ID = "11111111-2222-3333-4444-555555555555";
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

/** Same window the route computes: today at 00:00 UTC back (days-1) days. */
function windowStart(days: number): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function dayKey(days: number, offsetDays: number): string {
  const d = new Date(windowStart(days));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("GET /api/owner/businesses/[id]/views", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_OK) as never);
    mockedAuthError.mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);

    const res = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(401);
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid business ID", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/owner/businesses/nope/views"),
      { params: Promise.resolve({ id: "nope" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the business does not exist", async () => {
    mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));

    const res = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the business belongs to someone else", async () => {
    mockPoolClient(
      jest.fn().mockResolvedValue({ rows: [{ owner_id: "someone-else" }] })
    );

    const res = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("returns daily counts and fills missing days with zero", async () => {
    // 3-day window: views only on the second day.
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ owner_id: "u-1" }] })
      .mockResolvedValueOnce({ rows: [{ day: dayKey(3, 1), views: 5 }] });
    mockPoolClient(query);

    const res = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views?days=3`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.businessId).toBe(BIZ_ID);
    expect(body.data.days).toEqual([
      { date: dayKey(3, 0), views: 0 },
      { date: dayKey(3, 1), views: 5 },
      { date: dayKey(3, 2), views: 0 },
    ]);
  });

  it("defaults to 30 days when the param is absent", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ owner_id: "u-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    mockPoolClient(query);

    const res = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    const body = await res.json();
    expect(body.data.days).toHaveLength(30);
  });

  it("clamps days to the 1..90 range", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ owner_id: "u-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    mockPoolClient(query);

    const big = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views?days=500`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect((await big.json()).data.days).toHaveLength(90);

    mockPoolClient(
      jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ owner_id: "u-1" }] })
        .mockResolvedValueOnce({ rows: [] })
    );
    const small = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views?days=0`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect((await small.json()).data.days).toHaveLength(1);
  });

  it("returns 500 on database error", async () => {
    mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));

    const res = await GET(
      new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}/views`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(500);
  });
});
