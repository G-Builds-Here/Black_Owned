/**
 * Route specs for GET /api/pending-businesses (LOC-0100).
 *
 * The admin review queue gains an opt-in ?prioritize=quality mode: items come
 * back quality-score ascending (weakest submissions first), ties oldest-first,
 * in memory only. The unflagged response — order, envelope, item shape — is
 * sacrosanct (blueprint DR-3), and nothing about prioritization may persist.
 *
 * Unit class per the story's AC Test Contracts: the data layer is fully
 * mocked, so these are route-level unit specs, not DB integration tests.
 */

import { NextRequest } from "next/server";
import { GET, PendingBusinessResponse } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

// Every exported data-layer function is a jest.fn here; AC3 asserts the
// mutating ones (insert/batch-import/import-normalized) were never called.
// This repository exposes no update/delete surface — those names cover every
// write path a prioritized GET could reach.
jest.mock("@/lib/db/pending-import-business-repository", () => ({
  findPendingByStatus: jest.fn(),
  countByStatus: jest.fn(),
  findBusinessesByJobId: jest.fn(),
  insertPendingBusiness: jest.fn(),
  batchImportBusinesses: jest.fn(),
  importNormalizedBusinesses: jest.fn(),
  insertPendingImportBusiness: jest.fn(),
}));

jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

const { getPool } = require("@/lib/db/user-repository");
const {
  findPendingByStatus,
  insertPendingBusiness,
  batchImportBusinesses,
  importNormalizedBusinesses,
  insertPendingImportBusiness,
} = require("@/lib/db/pending-import-business-repository");
const { createAuthMiddleware } = require("@/lib/auth/jwt-middleware");

const AUTH_OK = {
  authenticated: true,
  user: { userId: "u-admin", email: "admin@example.com", role: "admin" },
  statusCode: 200,
};

interface FakePendingRow {
  id: string;
  name: string;
  description: string | undefined;
  category_id: string;
  status: string;
  source: string;
  source_data: Record<string, unknown>;
  job_id: undefined;
  rejection_reason: null;
  created_at: Date;
  updated_at: Date;
}

/** DB rows as pg returns them (snake_case); the route maps them to the response shape. */
function pendingRow(
  id: string,
  createdAtISO: string,
  sourceData: Record<string, unknown>
): FakePendingRow {
  return {
    id,
    name: `Business ${id}`,
    description: undefined,
    category_id: "food-dining",
    status: "pending_review",
    source: "google-maps",
    source_data: sourceData,
    job_id: undefined,
    rejection_reason: null,
    created_at: new Date(createdAtISO),
    updated_at: new Date(createdAtISO),
  };
}

/**
 * AC1 fixture. Scores are what the LOC-0098 adapter (scorePendingImport)
 * yields for pending rows — it maps only name/phone/website from sourceData:
 *   row-a {source, originalId}                 -> 0
 *   row-b {phone, website}                     -> 35
 *   row-c {phone, website, social URL}         -> 35 (socials carry no weight
 *        for pending rows; the story's observable A,B,C order is preserved by
 *        the oldest-first tie-break: row-b is older than row-c)
 * The repository's own ORDER BY created_at DESC returns them newest-first,
 * so the unflagged order is [c, b, a] and prioritized must be [a, b, c].
 */
function acOneFixture(): FakePendingRow[] {
  return [
    pendingRow("row-c", "2026-09-03T00:00:00.000Z", {
      source: "google-maps",
      originalId: "c1",
      phone: "+1-555-0003",
      website: "https://c.example.com",
      socials: ["https://instagram.com/c"],
    }),
    pendingRow("row-b", "2026-09-02T00:00:00.000Z", {
      source: "google-maps",
      originalId: "b1",
      phone: "+1-555-0002",
      website: "https://b.example.com",
    }),
    pendingRow("row-a", "2026-09-01T00:00:00.000Z", {
      source: "google-maps",
      originalId: "a1",
    }),
  ];
}

/**
 * Route specs build requests the way admin/dashboard/route.spec.ts does: the
 * route only reads nextUrl.searchParams (auth is mocked), so a URL-shaped
 * stand-in is the honest minimum the handler can observe.
 */
function makeRequest(query = ""): NextRequest {
  return {
    nextUrl: new URL(`http://localhost/api/pending-businesses${query}`),
  } as unknown as NextRequest;
}

function routeJson(response: Response): Promise<{
  success: boolean;
  data?: PendingBusinessResponse[];
  error?: string;
}> {
  return response.json() as Promise<{
    success: boolean;
    data?: PendingBusinessResponse[];
    error?: string;
  }>;
}

describe("GET /api/pending-businesses (admin review queue)", () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    (createAuthMiddleware as jest.Mock).mockReturnValue(
      jest.fn(async () => AUTH_OK)
    );
    mockClient = { query: jest.fn(), release: jest.fn() };
    const mockPool = { connect: jest.fn().mockResolvedValue(mockClient) };
    (getPool as jest.Mock).mockReturnValue(mockPool);
  });

  describe("AC1: prioritized queue returns weakest-first with a stable tie-break", () => {
    it("returns 200, weakest-first order, and a shape identical to the unflagged response", async () => {
      (findPendingByStatus as jest.Mock).mockResolvedValue(acOneFixture());

      const flaggedResponse = await GET(makeRequest("?prioritize=quality"));
      const unflaggedResponse = await GET(makeRequest());

      expect(flaggedResponse.status).toBe(200);
      const flagged = await routeJson(flaggedResponse);
      const unflagged = await routeJson(unflaggedResponse);

      // Standard success envelope, unchanged by the flag.
      expect(flagged.success).toBe(true);
      expect(Object.keys(flagged).sort()).toEqual(["data", "success"]);

      // Score-ascending order with the oldest-first tie-break: 0-row, then
      // the two 35-rows (b older than c), i.e. exactly A, B, C.
      expect(flagged.data?.map((item) => item.id)).toEqual([
        "row-a",
        "row-b",
        "row-c",
      ]);

      // Item shape and per-item content identical to the unflagged response —
      // only order may differ.
      expect(flagged.data?.length).toBe(unflagged.data?.length);
      const unflaggedById = new Map(
        unflagged.data?.map((item) => [item.id, item])
      );
      for (const item of flagged.data ?? []) {
        const baseline = unflaggedById.get(item.id);
        expect(baseline).toBeDefined();
        expect(Object.keys(item).sort()).toEqual(
          Object.keys(baseline as PendingBusinessResponse).sort()
        );
        expect(item).toEqual(baseline);
      }
    });

    it("orders equal scores oldest-first", async () => {
      const newer = pendingRow("tie-newer", "2026-08-15T12:00:00.000Z", {
        source: "google-maps",
        originalId: "n",
      });
      const older = pendingRow("tie-older", "2026-08-14T12:00:00.000Z", {
        source: "google-maps",
        originalId: "o",
      });
      (findPendingByStatus as jest.Mock).mockResolvedValue([newer, older]);

      const response = await GET(makeRequest("?prioritize=quality"));
      const body = await routeJson(response);

      expect(body.data?.map((item) => item.id)).toEqual([
        "tie-older",
        "tie-newer",
      ]);
    });

    it("two identical prioritized reads agree (total order, no churn)", async () => {
      (findPendingByStatus as jest.Mock).mockResolvedValue(acOneFixture());

      const first = await routeJson(await GET(makeRequest("?prioritize=quality")));
      const second = await routeJson(await GET(makeRequest("?prioritize=quality")));

      expect(second.data?.map((item) => item.id)).toEqual(
        first.data?.map((item) => item.id)
      );
    });
  });

  describe("AC2: the unflagged queue is untouched", () => {
    it("returns today's order and shape with no prioritize parameter", async () => {
      const rows = acOneFixture();
      (findPendingByStatus as jest.Mock).mockResolvedValue(rows);

      const response = await GET(makeRequest());
      const body = await routeJson(response);

      // Repository returns created_at DESC ([c, b, a]); the route must hand
      // that order through untouched — the flag, not the fetch, owns ordering.
      expect(body.data?.map((item) => item.id)).toEqual([
        "row-c",
        "row-b",
        "row-a",
      ]);
      expect(Object.keys(body).sort()).toEqual(["data", "success"]);
    });

    it("treats an unrecognized prioritize value exactly like the unflagged queue", async () => {
      (findPendingByStatus as jest.Mock).mockResolvedValue(acOneFixture());

      const unknownFlag = await routeJson(
        await GET(makeRequest("?prioritize=colors"))
      );
      const unflagged = await routeJson(await GET(makeRequest()));

      expect(unknownFlag).toEqual(unflagged);
    });
  });

  describe("AC3: prioritization never persists anything", () => {
    it("records zero data-layer write calls and leaves every pending row byte-identical", async () => {
      const rows = acOneFixture();
      const rowsBefore = JSON.parse(JSON.stringify(rows));
      (findPendingByStatus as jest.Mock).mockResolvedValue(rows);

      const response = await GET(makeRequest("?prioritize=quality"));
      const body = await routeJson(response);

      // The prioritized read still works (guard against a vacuous pass).
      expect(body.success).toBe(true);
      expect(body.data?.map((item) => item.id)).toEqual([
        "row-a",
        "row-b",
        "row-c",
      ]);

      // Zero create/update/delete calls on the data layer during the request.
      expect(insertPendingBusiness).not.toHaveBeenCalled();
      expect(batchImportBusinesses).not.toHaveBeenCalled();
      expect(importNormalizedBusinesses).not.toHaveBeenCalled();
      expect(insertPendingImportBusiness).not.toHaveBeenCalled();

      // Rows byte-identical to their pre-request state (ordering is in-memory
      // over the mapped response items, never over the stored rows).
      expect(JSON.parse(JSON.stringify(rows))).toEqual(rowsBefore);
    });
  });
});
