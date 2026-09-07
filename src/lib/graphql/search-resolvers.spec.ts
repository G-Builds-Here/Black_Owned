/**
 * searchBusinesses resolver tests.
 *
 * The resolver is backed by the real public directory source
 * (fetchDirectoryItems: approved pending businesses + canonical businesses).
 * The directory source and the Valkey query cache are mocked so the suite
 * runs in the unit runner; the behavior under test is ranking, facets,
 * pagination, and mapping of real directory rows.
 */

import { searchBusinesses } from "./resolvers";
import { fetchDirectoryItems } from "@/app/api/directory/route";

jest.mock("./query-cache", () => ({
  getCachedResponse: jest.fn().mockResolvedValue(null),
  cacheResponse: jest.fn().mockResolvedValue(undefined),
}));

const mockQuery = jest.fn();
const mockRelease = jest.fn();

jest.mock("../db/user-repository", () => ({
  getPool: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    }),
  })),
  findByEmail: jest.fn(),
  create: jest.fn(),
}));

jest.mock("@/app/api/directory/route", () => ({
  fetchDirectoryItems: jest.fn(),
  deriveLocation: jest.fn(),
  filterDirectoryItems: jest.fn(),
  buildDirectoryFacets: jest.fn(),
  GET: jest.fn(),
}));

// Realistic directory rows: approved pending imports + a canonical business
const directoryItems = [
  {
    id: "pend-1",
    name: "Auburn Angel",
    category: "Food & Dining",
    rating: 4.6,
    reviewCount: 120,
    location: "302 Auburn Ave NE, Atlanta, GA 30303",
    isVerified: true,
    description: "Afro-Caribbean soul food",
    website: "https://auburnangel.com",
    phone: null,
    source: "manual",
    createdAt: "2026-08-22T00:00:00.000Z",
  },
  {
    id: "pend-2",
    name: "Kindred Healing Center",
    category: "Health & Wellness",
    rating: null,
    reviewCount: null,
    location: "1800 Jonesboro Rd SE, Atlanta, GA 30315",
    isVerified: true,
    description: "Holistic healing services",
    website: null,
    phone: null,
    source: "manual",
    createdAt: "2026-08-22T00:00:00.000Z",
  },
  {
    id: "biz-1",
    name: "Soul Food Kitchen",
    category: "Food & Dining",
    rating: null,
    reviewCount: null,
    location: "",
    isVerified: false,
    description: "Authentic Southern cuisine with a modern twist.",
    website: null,
    phone: null,
    source: null,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
];

function setDirectoryItems(items: unknown[]) {
  (fetchDirectoryItems as jest.Mock).mockResolvedValue(items);
}

type SearchResults = Awaited<ReturnType<typeof searchBusinesses>>;

describe("searchBusinesses resolver (real directory data)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDirectoryItems(directoryItems);
  });

  it("returns all real businesses when the query is empty", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "", page: 1, pageSize: 10 });

    expect(result.total).toBe(3);
    expect(result.businesses.map((b) => b.name)).toEqual([
      "Auburn Angel",
      "Kindred Healing Center",
      "Soul Food Kitchen",
    ]);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.facets).toEqual([
      { category: "Food & Dining", count: 2 },
      { category: "Health & Wellness", count: 1 },
    ]);
  });

  it("maps directory rows to the search business shape with safe defaults", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "" });

    const kindred = result.businesses.find((b) => b.name === "Kindred Healing Center");
    expect(kindred).toMatchObject({
      rating: 0,
      reviewCount: 0,
      location: "1800 Jonesboro Rd SE, Atlanta, GA 30315",
      isVerified: true,
      description: "Holistic healing services",
      tags: [],
    });
  });

  it("searches by business name case-insensitively", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "auburn", page: 1, pageSize: 10 });

    expect(result.businesses.map((b) => b.name)).toEqual(["Auburn Angel"]);
    expect(result.total).toBe(1);
  });

  it("treats upper-case, lower-case, and mixed-case queries equally", async () => {
    const upper: SearchResults = await searchBusinesses({}, { query: "AUBURN ANGEL" });
    const lower: SearchResults = await searchBusinesses({}, { query: "auburn angel" });
    const mixed: SearchResults = await searchBusinesses({}, { query: "AuBuRn AnGeL" });

    expect(upper.businesses.map((b) => b.name)).toEqual(["Auburn Angel"]);
    expect(lower.businesses.map((b) => b.name)).toEqual(
      upper.businesses.map((b) => b.name)
    );
    expect(mixed.businesses.map((b) => b.name)).toEqual(
      upper.businesses.map((b) => b.name)
    );
  });

  it("searches by category", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "Health & Wellness" });

    expect(result.businesses.map((b) => b.name)).toEqual(["Kindred Healing Center"]);
    expect(result.facets).toEqual([{ category: "Health & Wellness", count: 1 }]);
  });

  it("searches by description", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "cuisine" });

    expect(result.businesses.map((b) => b.name)).toEqual(["Soul Food Kitchen"]);
  });

  it("searches by location", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "Jonesboro" });

    expect(result.businesses.map((b) => b.name)).toEqual(["Kindred Healing Center"]);
  });

  it("returns empty results for a non-matching query", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "xyznonexistent" });

    expect(result.businesses).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
    expect(result.facets).toEqual([]);
  });

  it("ranks name matches above description matches", async () => {
    // "soul" matches the name of Soul Food Kitchen (name weight) and only the
    // description of Auburn Angel (lower weight)
    const result: SearchResults = await searchBusinesses({}, { query: "soul" });

    expect(result.businesses.map((b) => b.name)).toEqual([
      "Soul Food Kitchen",
      "Auburn Angel",
    ]);
  });

  it("paginates results", async () => {
    const page1: SearchResults = await searchBusinesses({}, { query: "", page: 1, pageSize: 2 });
    const page2: SearchResults = await searchBusinesses({}, { query: "", page: 2, pageSize: 2 });

    expect(page1.businesses).toHaveLength(2);
    expect(page2.businesses).toHaveLength(1);
    expect(page1.totalPages).toBe(2);
    expect(page1.businesses[0].id).not.toBe(page2.businesses[0].id);
  });

  it("returns an empty page beyond the last page", async () => {
    const result: SearchResults = await searchBusinesses({}, { query: "", page: 100, pageSize: 10 });

    expect(result.businesses).toEqual([]);
    expect(result.page).toBe(100);
  });

  it("resolves without any auth context (public query)", async () => {
    const result: SearchResults = await searchBusinesses(undefined, { query: "healing" });

    expect(result).toBeDefined();
    expect(Array.isArray(result.businesses)).toBe(true);
    expect(Array.isArray(result.facets)).toBe(true);
  });
});
