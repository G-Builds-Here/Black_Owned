/**
 * POST /api/businesses/claim tests
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

function claimRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/businesses/claim", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/businesses/claim", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_OK) as never);
    mockedAuthError.mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);

    const res = await POST(
      claimRequest({ name: "Soul Kitchen", categoryId: "c7e04c6a" })
    );
    expect(res.status).toBe(401);
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY when the body is missing", async () => {
    const res = await POST(claimRequest(undefined));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_BODY");
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_NAME when the name is blank or too long", async () => {
    let res = await POST(claimRequest({ name: "   ", categoryId: "c7e04c6a" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_NAME");

    res = await POST(claimRequest({ name: "x".repeat(256), categoryId: "c7e04c6a" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_NAME");
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_CATEGORY when no category is provided", async () => {
    const res = await POST(claimRequest({ name: "Soul Kitchen" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_CATEGORY");
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_CATEGORY when the category is not a UUID", async () => {
    const res = await POST(
      claimRequest({ name: "Soul Kitchen", categoryId: "does-not-exist" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_CATEGORY");
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 400 when the category does not exist", async () => {
    mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));

    const res = await POST(
      claimRequest({ name: "Soul Kitchen", categoryId: "00000000-0000-4000-8000-000000000000" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_CATEGORY");
  });

  it("creates the business under the user as unverified and returns 201", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "b-1",
            name: "Soul Kitchen",
            category_id: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d",
            verification_status: "unverified",
          },
        ],
      });
    mockPoolClient(query);

    const res = await POST(
      claimRequest({
        name: "  Soul Kitchen  ",
        description: "Southern soul food",
        categoryId: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d",
        location: "Atlanta, GA",
        website: "https://soul.example.com",
      })
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.business).toEqual({
      id: "b-1",
      name: "Soul Kitchen",
      categoryId: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d",
      status: "unverified",
    });

    const insertCall = query.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO")
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      "u-1",
      "Soul Kitchen",
      "Southern soul food",
      "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d",
      "Atlanta, GA",
      "https://soul.example.com",
    ]);
    expect(String(insertCall![0])).toContain("'unverified'");
  });

  it("stores null for omitted optional fields", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "b-1",
            name: "Soul Kitchen",
            category_id: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d",
            verification_status: "unverified",
          },
        ],
      });
    mockPoolClient(query);

    const res = await POST(
      claimRequest({ name: "Soul Kitchen", categoryId: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d" })
    );
    expect(res.status).toBe(201);

    const insertCall = query.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO")
    );
    expect(insertCall![1]).toEqual(["u-1", "Soul Kitchen", null, "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d", null, null]);
  });

  it("returns 500 on database error", async () => {
    mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));

    const res = await POST(
      claimRequest({ name: "Soul Kitchen", categoryId: "c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d" })
    );
    expect(res.status).toBe(500);
  });
});
