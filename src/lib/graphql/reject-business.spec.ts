/**
 * GraphQL Resolvers Tests - Reject Business
 */

// Mock user-repository before importing resolvers (to prevent pg module loading)
jest.mock("../db/user-repository", () => {
  const mockPool = {
    connect: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn(),
    })),
  };
  return {
    findByEmail: jest.fn(),
    create: jest.fn(),
    initializeUserSchema: jest.fn(),
    closePool: jest.fn(),
    getPool: jest.fn(() => mockPool),
  };
});

// Mock auth-service before importing resolvers
jest.mock("../auth/auth-service", () => ({
  verifyToken: jest.fn(),
  hashPassword: jest.fn(),
  generateTokenPair: jest.fn(),
  storeRefreshToken: jest.fn(),
}));

// Mock scraped-business-repository before importing resolvers
jest.mock("../db/scraped-business-repository", () => ({
  findScrapedBusinessesByStatus: jest.fn(),
  updateScrapedBusinessStatus: jest.fn(),
  findScrapedBusinessById: jest.fn(),
  rejectScrapedBusiness: jest.fn(),
}));

// Mock valkey-client
jest.mock("../valkey/valkey-client", () => ({
  storeRefreshToken: jest.fn(),
}));

import { rejectBusiness } from "./resolvers";
import { findScrapedBusinessById, rejectScrapedBusiness } from "../db/scraped-business-repository";

describe("rejectBusiness resolver", () => {
  const mockBusinessId = "biz-123";
  const mockRejectionReason = "Incomplete documentation";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject request with missing business ID", async () => {
    const result = await rejectBusiness(
      null,
      { businessId: "", rejectionReason: mockRejectionReason },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Business ID is required");
  });

  it("should reject request with missing rejection reason", async () => {
    const result = await rejectBusiness(
      null,
      { businessId: mockBusinessId, rejectionReason: "" },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Rejection reason is required");
  });

  it("should reject request with whitespace-only rejection reason", async () => {
    const result = await rejectBusiness(
      null,
      { businessId: mockBusinessId, rejectionReason: "   " },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Rejection reason is required");
  });

  it("should reject when business is not found", async () => {
    (findScrapedBusinessById as jest.Mock).mockResolvedValue(undefined);

    const result = await rejectBusiness(
      null,
      { businessId: mockBusinessId, rejectionReason: mockRejectionReason },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Business not found");
    expect(findScrapedBusinessById).toHaveBeenCalledWith(expect.anything(), mockBusinessId);
  });

  it("should successfully reject business with valid reason", async () => {
    const mockBusiness = {
      id: mockBusinessId,
      scrapeJobId: "job-123",
      source: "google",
      name: "Test Business",
      address: "123 Test St",
      status: "pending_review",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockRejectedBusiness = {
      ...mockBusiness,
      status: "rejected",
      updatedAt: new Date(),
    };

    (findScrapedBusinessById as jest.Mock).mockResolvedValue(mockBusiness);
    (rejectScrapedBusiness as jest.Mock).mockResolvedValue(mockRejectedBusiness);

    const result = await rejectBusiness(
      null,
      { businessId: mockBusinessId, rejectionReason: mockRejectionReason },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(findScrapedBusinessById).toHaveBeenCalledWith(expect.anything(), mockBusinessId);
    expect(rejectScrapedBusiness).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: mockBusinessId,
        rejectionReason: mockRejectionReason,
      })
    );
  });

  it("should trim rejection reason before saving", async () => {
    const mockBusiness = {
      id: mockBusinessId,
      scrapeJobId: "job-123",
      source: "google",
      name: "Test Business",
      address: "123 Test St",
      status: "pending_review",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockRejectedBusiness = {
      ...mockBusiness,
      status: "rejected",
      updatedAt: new Date(),
    };

    (findScrapedBusinessById as jest.Mock).mockResolvedValue(mockBusiness);
    (rejectScrapedBusiness as jest.Mock).mockResolvedValue(mockRejectedBusiness);

    await rejectBusiness(
      null,
      { businessId: mockBusinessId, rejectionReason: "  Reason with spaces  " },
      {}
    );

    expect(rejectScrapedBusiness).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: mockBusinessId,
        rejectionReason: "Reason with spaces",
      })
    );
  });

  it("should handle database errors gracefully", async () => {
    const mockBusiness = {
      id: mockBusinessId,
      scrapeJobId: "job-123",
      source: "google",
      name: "Test Business",
      address: "123 Test St",
      status: "pending_review",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (findScrapedBusinessById as jest.Mock).mockResolvedValue(mockBusiness);
    (rejectScrapedBusiness as jest.Mock).mockRejectedValue(new Error("Database connection failed"));

    const result = await rejectBusiness(
      null,
      { businessId: mockBusinessId, rejectionReason: mockRejectionReason },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to reject business");
  });

  it("should handle rejectScrapedBusiness returning undefined", async () => {
    const mockBusiness = {
      id: mockBusinessId,
      scrapeJobId: "job-123",
      source: "google",
      name: "Test Business",
      address: "123 Test St",
      status: "pending_review",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (findScrapedBusinessById as jest.Mock).mockResolvedValue(mockBusiness);
    (rejectScrapedBusiness as jest.Mock).mockResolvedValue(undefined);

    const result = await rejectBusiness(
      null,
      { businessId: mockBusinessId, rejectionReason: mockRejectionReason },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to reject business");
  });
});
