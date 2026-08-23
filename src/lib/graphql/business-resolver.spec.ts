/**
 * business(id:) Query resolver tests
 *
 * Verifies the resolution order: canonical businesses -> approved pending
 * -> scraped fallback (unverified) -> null.
 */

import { getPool } from "../db/user-repository";
import { findBusinessById } from "../db/business-repository";
import { findScrapedBusinessById } from "../db/scraped-business-repository";
import { business } from "./resolvers";

jest.mock("../db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("../db/business-repository", () => ({
  findBusinessById: jest.fn(),
  updateNameById: jest.fn(),
}));

jest.mock("../db/scraped-business-repository", () => ({
  findScrapedBusinessById: jest.fn(),
}));

const BIZ_ID = "11111111-2222-4333-8444-555555555555";

describe("business(id:) resolver", () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { query: jest.fn(), release: jest.fn() };
    (getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue(mockClient) });
  });

  it("should resolve a canonical business first", async () => {
    (findBusinessById as jest.Mock).mockResolvedValue({
      id: BIZ_ID,
      ownerId: "owner-1",
      name: "Canonical Biz",
      description: "desc",
      categoryId: "food-dining",
      verificationStatus: "verified",
      createdAt: new Date("2026-01-15T00:00:00Z"),
      updatedAt: new Date("2026-01-15T00:00:00Z"),
    });

    const result = await business(undefined, { id: BIZ_ID });

    expect(result).toEqual({
      id: BIZ_ID,
      name: "Canonical Biz",
      categoryId: "food-dining",
      verified: true,
      socialUrls: null,
      createdAt: { timestamp: Math.floor(new Date("2026-01-15T00:00:00Z").getTime() / 1000) },
    });
    // Should not query pending or scraped when canonical is found
    expect(mockClient.query).not.toHaveBeenCalled();
    expect(findScrapedBusinessById).not.toHaveBeenCalled();
  });

  it("should fall back to an approved pending business as verified", async () => {
    (findBusinessById as jest.Mock).mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: BIZ_ID,
          name: "Pending Biz",
          category_id: "retail",
          created_at: new Date("2026-02-20T00:00:00Z"),
        },
      ],
    });

    const result = await business(undefined, { id: BIZ_ID });

    expect(result).toEqual({
      id: BIZ_ID,
      name: "Pending Biz",
      categoryId: "retail",
      verified: true,
      socialUrls: null,
      createdAt: { timestamp: Math.floor(new Date("2026-02-20T00:00:00Z").getTime() / 1000) },
    });
    expect(findScrapedBusinessById).not.toHaveBeenCalled();
  });

  it("should not fall back to a pending business that is not approved", async () => {
    (findBusinessById as jest.Mock).mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({ rows: [] });
    (findScrapedBusinessById as jest.Mock).mockResolvedValue(undefined);

    const result = await business(undefined, { id: BIZ_ID });

    expect(result).toBeNull();
  });

  it("should fall back to a scraped business as unverified", async () => {
    (findBusinessById as jest.Mock).mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({ rows: [] });
    (findScrapedBusinessById as jest.Mock).mockResolvedValue({
      id: BIZ_ID,
      scrapeJobId: "job-1",
      source: "yelp",
      name: "Scraped Biz",
      address: "1 Main St",
      category: "restaurants",
      rating: 4.2,
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await business(undefined, { id: BIZ_ID });

    expect(result).toEqual({
      id: BIZ_ID,
      name: "Scraped Biz",
      categoryId: "restaurants",
      verified: false,
      socialUrls: null,
      createdAt: { timestamp: Math.floor(new Date("2026-03-01T00:00:00Z").getTime() / 1000) },
    });
  });

  it("should default the category to other for scraped businesses without one", async () => {
    (findBusinessById as jest.Mock).mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({ rows: [] });
    (findScrapedBusinessById as jest.Mock).mockResolvedValue({
      id: BIZ_ID,
      scrapeJobId: "job-1",
      source: "yelp",
      name: "No Category Biz",
      address: "1 Main St",
      category: undefined,
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await business(undefined, { id: BIZ_ID });

    expect(result?.categoryId).toBe("other");
    expect(result?.verified).toBe(false);
  });

  it("should return null when no source has the id", async () => {
    (findBusinessById as jest.Mock).mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({ rows: [] });
    (findScrapedBusinessById as jest.Mock).mockResolvedValue(undefined);

    const result = await business(undefined, { id: BIZ_ID });

    expect(result).toBeNull();
  });

  it("should return null for an empty id", async () => {
    const result = await business(undefined, { id: "" });

    expect(result).toBeNull();
    expect(getPool).not.toHaveBeenCalled();
  });
});
