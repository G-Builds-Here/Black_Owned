/**
 * /api/chat/conversations/:id/messages tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { createAuthErrorResponse } from "@/lib/auth/jwt-middleware";
import { publishJson } from "@/lib/nats/nats-client";
import { GET, POST } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

jest.mock("@/lib/nats/nats-client", () => ({
  publishJson: jest.fn(),
}));

import { createAuthMiddleware } from "@/lib/auth/jwt-middleware";

const mockedGetPool = jest.mocked(getPool);
const mockedCreateAuth = jest.mocked(createAuthMiddleware);
const mockedAuthError = jest.mocked(createAuthErrorResponse);
const mockedPublish = jest.mocked(publishJson);

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

function messageRequest(method: "GET" | "POST", body?: unknown, query = "") {
  const url = `http://localhost/api/chat/conversations/${CONVERSATION_ID}/messages${query}`;
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/chat/conversations/:id/messages", () => {
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
      const res = await GET(messageRequest("GET"), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 for a malformed conversation id", async () => {
      const res = await GET(messageRequest("GET"), { params: Promise.resolve({ id: "nope" }) });
      expect(res.status).toBe(400);
      expect(mockedGetPool).not.toHaveBeenCalled();
    });

    it("returns 404 when the conversation is not the user's", async () => {
      mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));
      const res = await GET(messageRequest("GET"), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("NOT_FOUND");
    });

    it("returns the message history newest first with hasMore paging", async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [ACCESS_ROW] })
        .mockResolvedValue({
          rows: [
            {
              id: "m-2",
              sender_user_id: "owner-9",
              body: "Yes, until 9pm",
              is_read: true,
              created_at: "2026-08-22T12:00:00Z",
              sender_name: "Owner",
            },
            {
              id: "m-1",
              sender_user_id: "u-1",
              body: "Are you open today?",
              is_read: true,
              created_at: "2026-08-22T11:00:00Z",
              sender_name: "User",
            },
          ],
        });
      mockPoolClient(query);

      const res = await GET(messageRequest("GET"), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.hasMore).toBe(false);
      expect(body.data.messages.map((m: { body: string }) => m.body)).toEqual([
        "Yes, until 9pm",
        "Are you open today?",
      ]);
    });

    it("returns 500 on database error", async () => {
      mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));
      const res = await GET(messageRequest("GET"), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);
      const res = await POST(messageRequest("POST", { body: "hi" }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when the body is missing, blank, or too long", async () => {
      let res = await POST(messageRequest("POST"), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_BODY");

      res = await POST(messageRequest("POST", { body: "   " }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(400);

      res = await POST(messageRequest("POST", { body: "x".repeat(2001) }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(400);
      expect(mockedGetPool).not.toHaveBeenCalled();
    });

    it("persists the message and publishes the thread + notification events", async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [ACCESS_ROW] })
        .mockResolvedValueOnce({
          rows: [{ id: "m-1", sender_user_id: "u-1", body: "Are you open today?", is_read: true, created_at: "2026-08-22T11:00:00Z" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ name: "User" }] })
        .mockResolvedValueOnce({ rows: [{ name: "Cozy Corner Cafe" }] });
      mockPoolClient(query);
      mockedPublish.mockResolvedValue(true);

      const res = await POST(messageRequest("POST", { body: "  Are you open today?  " }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.delivered).toBe(true);
      expect(body.data.message).toMatchObject({ id: "m-1", body: "Are you open today?" });

      const insertCall = query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO"));
      expect(insertCall![1]).toEqual([CONVERSATION_ID, "biz-1", "u-1", "Are you open today?"]);

      expect(mockedPublish).toHaveBeenCalledWith(
        `chat.message.${CONVERSATION_ID}`,
        expect.objectContaining({
          businessName: "Cozy Corner Cafe",
          senderName: "User",
          body: "Are you open today?",
        })
      );
      expect(mockedPublish).toHaveBeenCalledWith(
        "chat.notification.owner-9",
        expect.objectContaining({ conversationId: CONVERSATION_ID, preview: "Are you open today?" })
      );
    });

    it("reports delivered=false when NATS is down but still returns the persisted message", async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [ACCESS_ROW] })
        .mockResolvedValueOnce({
          rows: [{ id: "m-1", sender_user_id: "u-1", body: "hi", is_read: true, created_at: "2026-08-22T11:00:00Z" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ name: "User" }] })
        .mockResolvedValueOnce({ rows: [{ name: "Cafe" }] });
      mockPoolClient(query);
      mockedPublish.mockResolvedValue(false);

      const res = await POST(messageRequest("POST", { body: "hi" }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).data.delivered).toBe(false);
    });

    it("does not publish when the business owner messages their own business", async () => {
      mockedCreateAuth.mockReturnValue(
        jest.fn(async () => ({
          ...AUTH_OK,
          user: { userId: "owner-9", email: "owner@example.com", role: "business_owner" },
        })) as never
      );
      const selfAccess = { ...ACCESS_ROW, user_id: "owner-9" };
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [selfAccess] })
        .mockResolvedValueOnce({
          rows: [{ id: "m-1", sender_user_id: "owner-9", body: "note to self", is_read: true, created_at: "2026-08-22T11:00:00Z" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ name: "Owner" }] })
        .mockResolvedValueOnce({ rows: [{ name: "Own Cafe" }] });
      mockPoolClient(query);

      const res = await POST(messageRequest("POST", { body: "note to self" }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).data.delivered).toBe(true);
      expect(mockedPublish).not.toHaveBeenCalled();
    });

    it("returns 404 when the conversation is not the user's", async () => {
      mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));
      const res = await POST(messageRequest("POST", { body: "hi" }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 500 on database error", async () => {
      mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));
      const res = await POST(messageRequest("POST", { body: "hi" }), {
        params: Promise.resolve({ id: CONVERSATION_ID }),
      });
      expect(res.status).toBe(500);
    });
  });
});
