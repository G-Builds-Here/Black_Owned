/**
 * /api/chat/conversations tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { createAuthErrorResponse } from "@/lib/auth/jwt-middleware";
import { GET, POST } from "./route";

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

describe("/api/chat/conversations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_OK) as never);
    mockedAuthError.mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);
      const res = await GET(new NextRequest("http://localhost/api/chat/conversations"));
      expect(res.status).toBe(401);
      expect(mockedGetPool).not.toHaveBeenCalled();
    });

    it("lists conversations with preview and unread count for the user only", async () => {
      const query = jest.fn().mockResolvedValue({
        rows: [
          {
            id: "c-1",
            business_id: "b-1",
            created_at: "2026-08-01T00:00:00Z",
            business_name: "Cozy Corner Cafe",
            category: "Food & Dining",
            last_message: "Are you open today?",
            last_message_at: "2026-08-22T00:00:00Z",
            unread_count: 2,
          },
        ],
      });
      mockPoolClient(query);

      const res = await GET(new NextRequest("http://localhost/api/chat/conversations"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(1);
      expect(body.data.conversations[0]).toMatchObject({
        id: "c-1",
        businessName: "Cozy Corner Cafe",
        lastMessage: "Are you open today?",
        unreadCount: 2,
      });
      expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE c.user_id = $1"), ["u-1"]);
    });

    it("returns an empty list when there are no conversations", async () => {
      mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));
      const res = await GET(new NextRequest("http://localhost/api/chat/conversations"));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.conversations).toEqual([]);
    });

    it("returns 500 on database error", async () => {
      mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));
      const res = await GET(new NextRequest("http://localhost/api/chat/conversations"));
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    const bizId = "b1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    function post(body?: unknown) {
      return POST(
        new NextRequest("http://localhost/api/chat/conversations", {
          method: "POST",
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
    }

    it("returns 401 when unauthenticated", async () => {
      mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);
      const res = await post({ businessId: bizId });
      expect(res.status).toBe(401);
    });

    it("returns 400 INVALID_BUSINESS when the businessId is missing or malformed", async () => {
      let res = await post({});
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_BUSINESS");

      res = await post({ businessId: "not-a-uuid" });
      expect(res.status).toBe(400);
      expect(mockedGetPool).not.toHaveBeenCalled();
    });

    it("returns 404 when the business does not exist", async () => {
      mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));
      const res = await post({ businessId: bizId });
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("NOT_FOUND");
    });

    it("creates the conversation and returns 201", async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: bizId }] })
        .mockResolvedValueOnce({
          rows: [{ id: "c-1", business_id: bizId, created_at: "2026-08-22T00:00:00Z" }],
        });
      mockPoolClient(query);

      const res = await post({ businessId: bizId });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.created).toBe(true);
      expect(body.data.conversation.id).toBe("c-1");
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT (user_id, business_id) DO NOTHING"),
        ["u-1", bizId]
      );
    });

    it("resumes the existing conversation and returns 200 without a duplicate row", async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: bizId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "c-1", business_id: bizId, created_at: "2026-08-01T00:00:00Z" }],
        });
      mockPoolClient(query);

      const res = await post({ businessId: bizId });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.created).toBe(false);
      expect(body.data.conversation.id).toBe("c-1");
    });

    it("returns 500 on database error", async () => {
      mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));
      const res = await post({ businessId: bizId });
      expect(res.status).toBe(500);
    });
  });
});
