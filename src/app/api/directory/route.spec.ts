/**
 * GET /api/directory tests
 */

import { NextRequest } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  GET,
  deriveLocation,
  filterDirectoryItems,
  buildDirectoryFacets,
  DirectoryBusiness,
} from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

const pendingRow = {
  id: "pend-1",
  name: "Soul Kitchen",
  description: "Approved from review",
  category: "Food & Dining",
  source: "yelp",
  source_data: {
    source: "yelp",
    address: "123 Main St, Harlem, NY",
    phone: "555-0100",
    website: "https://soulkitchen.com",
    rating: 4.5,
    reviewCount: 88,
    category: "food-dining",
  },
  created_at: new Date("2026-08-01T00:00:00Z"),
};

const canonicalRow = {
  id: "biz-1",
  name: "Corner Store",
  description: "Owner submitted",
  category: "Retail & Fashion",
  verification_status: "verified",
  created_at: new Date("2026-08-10T00:00:00Z"),
};

const unverifiedCanonicalRow = {
  ...canonicalRow,
  id: "biz-2",
  name: "New Business",
  verification_status: "unverified",
};

function mockQuerySequence() {
  // First query: approved pending; second query: canonical businesses
  const query = jest
    .fn()
    .mockResolvedValueOnce({ rows: [pendingRow] })
    .mockResolvedValueOnce({ rows: [canonicalRow, unverifiedCanonicalRow] });
  return query;
}

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

describe("deriveLocation", () => {
  it("should derive neighborhood and city from a full address", () => {
    expect(deriveLocation("123 Main St, Harlem, NY")).toBe("Harlem, NY");
  });

  it("should return the address unchanged when it has two or fewer parts", () => {
    expect(deriveLocation("123 Main St, Harlem")).toBe("123 Main St, Harlem");
  });

  it("should return empty string for empty input", () => {
    expect(deriveLocation(null)).toBe("");
    expect(deriveLocation(undefined)).toBe("");
    expect(deriveLocation("")).toBe("");
  });
});

describe("filterDirectoryItems", () => {
  const items: DirectoryBusiness[] = [
    {
      id: "1",
      name: "Soul Kitchen",
      category: "food-dining",
      rating: 4.5,
      reviewCount: 88,
      location: "123 Main St, Harlem, NY",
      isVerified: true,
      description: null,
      website: null,
      phone: null,
      source: "yelp",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "2",
      name: "Corner Store",
      category: "retail",
      rating: null,
      reviewCount: null,
      location: "",
      isVerified: true,
      description: null,
      website: null,
      phone: null,
      source: null,
      createdAt: "2026-08-10T00:00:00.000Z",
    },
    {
      id: "3",
      name: "Zeta Cafe",
      category: "food-dining",
      rating: 3.0,
      reviewCount: 10,
      location: "9 Side St, Atlanta, GA",
      isVerified: true,
      description: null,
      website: null,
      phone: null,
      source: "google-maps",
      createdAt: "2026-08-05T00:00:00.000Z",
    },
  ];

  it("should filter by name search (case-insensitive)", () => {
    const result = filterDirectoryItems(items, { search: "soul" });
    expect(result.map((i) => i.id)).toEqual(["1"]);
  });

  it("should filter by exact category (case-insensitive)", () => {
    const result = filterDirectoryItems(items, { category: "FOOD-DINING" });
    expect(result.map((i) => i.id).sort()).toEqual(["1", "3"]);
  });

  it("should filter by location neighborhood", () => {
    const result = filterDirectoryItems(items, { location: "harlem" });
    expect(result.map((i) => i.id)).toEqual(["1"]);
  });

  it("should exclude businesses without a rating when minRating is set", () => {
    const result = filterDirectoryItems(items, { minRating: 4 });
    expect(result.map((i) => i.id)).toEqual(["1"]);
  });

  it("should sort by rating descending with nulls last", () => {
    const result = filterDirectoryItems(items, { sort: "rating" });
    expect(result.map((i) => i.id)).toEqual(["1", "3", "2"]);
  });

  it("should sort by name ascending", () => {
    const result = filterDirectoryItems(items, { sort: "name" });
    expect(result.map((i) => i.name)).toEqual(["Corner Store", "Soul Kitchen", "Zeta Cafe"]);
  });

  it("should sort newest first by default", () => {
    const result = filterDirectoryItems(items, {});
    expect(result.map((i) => i.id)).toEqual(["2", "3", "1"]);
  });
});

describe("buildDirectoryFacets", () => {
  it("should produce distinct sorted categories and locations", () => {
    const facets = buildDirectoryFacets([
      { id: "1", name: "A", category: "retail", location: "1 St, Harlem, NY", rating: null, reviewCount: null, isVerified: true, description: null, website: null, phone: null, source: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "2", name: "B", category: "food-dining", location: "2 St, Harlem, NY", rating: null, reviewCount: null, isVerified: true, description: null, website: null, phone: null, source: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "3", name: "C", category: "retail", location: "", rating: null, reviewCount: null, isVerified: true, description: null, website: null, phone: null, source: null, createdAt: "2026-01-01T00:00:00.000Z" },
    ]);

    expect(facets.categories).toEqual(["food-dining", "retail"]);
    expect(facets.locations).toEqual(["Harlem, NY"]);
  });
});

describe("GET /api/directory", () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { query: mockQuerySequence(), release: jest.fn() };
    (getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue(mockClient) });
  });

  it("should merge approved pending and canonical businesses with correct verification flags", async () => {
    const response = await GET(makeRequest("http://localhost/api/directory"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(3);

    const byId = Object.fromEntries(json.data.businesses.map((b: DirectoryBusiness) => [b.id, b]));

    // approved pending -> verified
    expect(byId["pend-1"].isVerified).toBe(true);
    expect(byId["pend-1"].rating).toBe(4.5);
    expect(byId["pend-1"].location).toBe("123 Main St, Harlem, NY");
    expect(byId["pend-1"].source).toBe("yelp");

    // verified canonical
    expect(byId["biz-1"].isVerified).toBe(true);
    expect(byId["biz-1"].rating).toBeNull();

    // unverified canonical
    expect(byId["biz-2"].isVerified).toBe(false);

    expect(json.data.facets.categories).toEqual(["Food & Dining", "Retail & Fashion"]);
    expect(json.data.facets.locations).toEqual(["Harlem, NY"]);
  });

  it("should reject invalid sort values", async () => {
    const response = await GET(makeRequest("http://localhost/api/directory?sort=bogus"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("should return 500 on database errors", async () => {
    mockClient.query = jest.fn().mockRejectedValue(new Error("db down"));
    const response = await GET(makeRequest("http://localhost/api/directory"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
