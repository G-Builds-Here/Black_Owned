/**
 * Quality Score API Route Tests
 *
 * Tests for POST /api/quality-score (LOC-0099)
 *
 * The route is DB-free by construction: it guards with the admin middleware,
 * shape-checks the body manually, and delegates scoring to the pure scorer
 * (LOC-0098). Auth is mocked per repo convention (approve/route.spec.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";

// Mock dependencies (auth guard — same mock surface as approve/route.spec.ts)
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

/** A complete listing payload: every scored signal present. */
const COMPLETE_PAYLOAD = {
  name: "Bloom Cafe",
  phone: "+1-555-0100",
  website: "https://bloom.example.com",
  socials: ["https://instagram.com/bloomcafe"],
  photos: [
    "https://cdn.example.com/bloom-1.jpg",
    "https://cdn.example.com/bloom-2.jpg",
    "https://cdn.example.com/bloom-3.jpg",
  ],
  openingHours: {
    monday: { open: "09:00", close: "17:00" },
  },
};

function postPayload(body: string): NextRequest {
  return new Request("http://localhost/api/quality-score", {
    method: "POST",
    body,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  (createAuthMiddleware as jest.Mock).mockReturnValue(
    jest.fn(async () => AUTH_OK)
  );
});

describe("POST /api/quality-score", () => {
  // AC1: Admin scores a valid listing over HTTP
  it("returns 200 with score 100 and the full breakdown for a complete listing", async () => {
    const response = await POST(postPayload(JSON.stringify(COMPLETE_PAYLOAD)));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.score).toBe(100);
    expect(json.data.breakdown).toEqual({
      phone: 15,
      website: 20,
      socials: 15,
      photos: 30,
      hours: 20,
    });
    const breakdownSum = Object.values(json.data.breakdown).reduce(
      (acc: number, points: unknown) => acc + (points as number),
      0
    );
    expect(breakdownSum).toBe(json.data.score);
  });

  it("scores a name-phone-website-only payload at exactly 35", async () => {
    const payload = {
      name: "Bloom Cafe",
      phone: "+1-555-0100",
      website: "https://bloom.example.com",
    };

    const response = await POST(postPayload(JSON.stringify(payload)));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.score).toBe(35);
  });

  it("returns identical score and breakdown for repeated identical POSTs", async () => {
    const body = JSON.stringify(COMPLETE_PAYLOAD);

    const first = await POST(postPayload(body));
    const second = await POST(postPayload(body));

    expect(await first.json()).toEqual(await second.json());
  });

  // NFR (blueprint section 8): score route p95 < 50 ms — pure compute, zero I/O.
  it("answers within the p95 < 50 ms budget for pure-compute scoring", async () => {
    const body = JSON.stringify(COMPLETE_PAYLOAD);
    const durations: number[] = [];

    for (let i = 0; i < 21; i++) {
      const start = performance.now();
      await POST(postPayload(body));
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)];
    expect(p95).toBeLessThan(50);
  });
});

describe("POST /api/quality-score — invalid requests (AC2)", () => {
  it("returns 400 with an error body naming the problem for a body that is not valid JSON", async () => {
    const response = await POST(postPayload("{ this is not json"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);
    expect(JSON.stringify(json)).not.toMatch(/score|breakdown/);
  });

  it("returns 400 naming the missing name field for an object without a name", async () => {
    const payload = {
      phone: "+1-555-0100",
      website: "https://bloom.example.com",
    };

    const response = await POST(postPayload(JSON.stringify(payload)));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(typeof json.error).toBe("string");
    expect(json.error).toMatch(/name/);
    expect(JSON.stringify(json)).not.toMatch(/score|breakdown/);
  });

  it("returns 400 naming the expected object shape for non-object bodies", async () => {
    const nonObjectBodies = ["[]", '"just a string"', "42"];

    for (const body of nonObjectBodies) {
      const response = await POST(postPayload(body));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(typeof json.error).toBe("string");
      expect(json.error.toLowerCase()).toContain("object");
      expect(JSON.stringify(json)).not.toMatch(/score|breakdown/);
    }
  });
});

describe("POST /api/quality-score — caller rejection (AC3)", () => {
  // Mirrors the real createAuthErrorResponse mapping (jwt-middleware.ts:139):
  // INSUFFICIENT_PERMISSIONS → 403, everything else → 401.
  const authErrorResponse = (errorType: string, errorMessage: string) =>
    NextResponse.json(
      { success: false, error: errorMessage, code: errorType },
      { status: errorType === "INSUFFICIENT_PERMISSIONS" ? 403 : 401 }
    );

  const AUTH_FORBIDDEN = {
    authenticated: false,
    errorType: "INSUFFICIENT_PERMISSIONS",
    errorMessage: "You do not have permission to access this resource",
    statusCode: 403,
  };
  const AUTH_NO_TOKEN = {
    authenticated: false,
    errorType: "NO_AUTH_HEADER",
    errorMessage: "Authorization header is required",
    statusCode: 401,
  };

  it("rejects an authenticated non-admin with the guard's 403 and computes no score", async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(
      jest.fn(async () => AUTH_FORBIDDEN)
    );
    (createAuthErrorResponse as jest.Mock).mockImplementation(
      authErrorResponse
    );

    const response = await POST(postPayload(JSON.stringify(COMPLETE_PAYLOAD)));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe(AUTH_FORBIDDEN.errorMessage);
    expect(JSON.stringify(json)).not.toMatch(/score|breakdown/);
    expect(createAuthErrorResponse).toHaveBeenCalledWith(
      "INSUFFICIENT_PERMISSIONS",
      AUTH_FORBIDDEN.errorMessage
    );
  });

  it("rejects an unauthenticated caller with the guard's 401 and computes no score", async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(
      jest.fn(async () => AUTH_NO_TOKEN)
    );
    (createAuthErrorResponse as jest.Mock).mockImplementation(
      authErrorResponse
    );

    const response = await POST(postPayload(JSON.stringify(COMPLETE_PAYLOAD)));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toBe(AUTH_NO_TOKEN.errorMessage);
    expect(JSON.stringify(json)).not.toMatch(/score|breakdown/);
    expect(createAuthErrorResponse).toHaveBeenCalledWith(
      "NO_AUTH_HEADER",
      AUTH_NO_TOKEN.errorMessage
    );
  });
});
