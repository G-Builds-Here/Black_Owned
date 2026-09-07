/**
 * GET /api/directory/suggest tests
 */

import { NextRequest } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { GET, buildSuggestions } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

/**
 * The suggest route reuses fetchDirectoryItems, which runs two queries
 * (approved pending businesses, then canonical businesses).
 */
function mockPoolWithNames(names: string[]) {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.includes("pending_import_businesses")) {
      return {
        rows: names.slice(0, Math.ceil(names.length / 2)).map((name, i) => ({
          id: `pend-${i}`,
          name,
          description: null,
          category: "Food & Dining",
          source: "yelp",
          source_data: {},
          created_at: new Date("2026-08-01T00:00:00Z"),
        })),
      };
    }
    return {
      rows: names.slice(Math.ceil(names.length / 2)).map((name, i) => ({
        id: `biz-${i}`,
        name,
        description: null,
        category: "Retail & Fashion",
        verification_status: "verified",
        created_at: new Date("2026-08-02T00:00:00Z"),
      })),
    };
  });
  const mockClient = { query, release: jest.fn() };
  (getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue(mockClient) });
  return mockClient;
}

describe("buildSuggestions", () => {
  it("matches case-insensitively by substring", () => {
    expect(buildSuggestions([{ name: "Soul Kitchen" }, { name: "Corner Store" }], "soul")).toEqual([
      "Soul Kitchen",
    ]);
    expect(buildSuggestions([{ name: "Soul Kitchen" }, { name: "Corner Store" }], "SOUL")).toEqual([
      "Soul Kitchen",
    ]);
  });

  it("deduplicates repeated names and keeps the first five", () => {
    const items = [
      "A One",
      "A One",
      "B Two",
      "B Two",
      "C Three",
      "C Three",
      "D Four",
      "E Five",
      "F Six",
    ].map((name) => ({ name }));
    // " " matches every name
    expect(buildSuggestions(items, " ")).toEqual(["A One", "B Two", "C Three", "D Four", "E Five"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(buildSuggestions([{ name: "Soul Kitchen" }], "zzz")).toEqual([]);
  });
});

describe("GET /api/directory/suggest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(["", "a", "   "])(
    "returns an empty suggestion list for queries under two chars (%p)",
    async (q) => {
      mockPoolWithNames(["Soul Kitchen"]);
      const response = await GET(makeRequest(`http://localhost:3000/api/directory/suggest?q=${encodeURIComponent(q)}`));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ success: true, data: { suggestions: [] } });
    }
  );

  it("returns matching business names (capped at five) for a valid query", async () => {
    const mockClient = mockPoolWithNames([
      "Soul Kitchen",
      "Soul Food House",
      "Soul Barbershop",
      "Soul Cafe",
      "Soul Books",
      "Soul Garden",
      "Corner Store",
    ]);

    const response = await GET(
      makeRequest("http://localhost:3000/api/directory/suggest?q=soul")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toEqual([
      "Soul Kitchen",
      "Soul Food House",
      "Soul Barbershop",
      "Soul Cafe",
      "Soul Books",
    ]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("returns an empty list when no business matches", async () => {
    mockPoolWithNames(["Soul Kitchen", "Corner Store"]);
    const response = await GET(
      makeRequest("http://localhost:3000/api/directory/suggest?q=zzz")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, data: { suggestions: [] } });
  });

  it("returns 500 when the database query fails", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const query = jest.fn().mockRejectedValue(new Error("db down"));
    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }),
    });

    const response = await GET(
      makeRequest("http://localhost:3000/api/directory/suggest?q=soul")
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Internal server error");
    consoleSpy.mockRestore();
  });
});
