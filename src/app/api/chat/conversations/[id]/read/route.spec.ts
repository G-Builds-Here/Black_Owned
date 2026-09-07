/**
 * POST /api/chat/conversations/:id/read tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { createAuthErrorResponse } from "@/lib/auth/jwt-middleware";
import { POST } from "./route";

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
  user: { userId: "u-1", email: "user@example.com", role: "user" },
  statusCode: 200,
};
const AUTH_FAIL = {
  authenticated: false,
  errorType: "NO_AUTH_HEADER",
  errorMessage: "Authorization header is required",
  statusCode: 401,
};

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_ROW = {
  conversation_id: CONVERSATION_ID,
  user_id: "u-1",
  business_id: "biz-1",
  owner_id: "owner-9",
};

function mockPoolClient(query: jest.Mock) {
  mockedGetPool.mockReturnValue({
    connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }),
  } as unknown as ReturnType<typeof getPool>);
}

describe("POST /api/chat/conversations/:id/read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_OK) as never);
    mockedAuthError.mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);
    const res = await POST(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed conversation id", async () => {
    const res = await POST(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(400);
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation is not the user's", async () => {
    mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));
    const res = await POST(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("marks the other party's messages read and reports the count", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [ACCESS_ROW] })
      .mockResolvedValue({ rowCount: 3 });
    mockPoolClient(query);

    const res = await POST(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.read).toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET is_read = TRUE"),
      [CONVERSATION_ID, "u-1"]
    );
  });

  it("returns 500 on database error", async () => {
    mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));
    const res = await POST(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });
    expect(res.status).toBe(500);
  });
});
