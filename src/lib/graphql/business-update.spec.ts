/**
 * GraphQL Resolvers Tests - Business Update
 */

// Mock pool/client so the resolver's `getPool().connect()` path resolves
// without a live Postgres. `mock`-prefixed so the hoisted jest.mock factory
// may reference them. (clearAllMocks in beforeEach preserves these
// implementations — only call history is cleared.)
const mockDbClient = { release: jest.fn() };
const mockDbPool = { connect: jest.fn().mockResolvedValue(mockDbClient) };

// Mock user-repository before importing resolvers (to prevent pg module loading)
jest.mock("../db/user-repository", () => ({
  findByEmail: jest.fn(),
  create: jest.fn(),
  closePool: jest.fn(),
  getPool: jest.fn(() => mockDbPool),
}));

// Mock auth-service before importing resolvers
jest.mock("../auth/auth-service", () => ({
  verifyToken: jest.fn(),
  hashPassword: jest.fn(),
  generateTokenPair: jest.fn(),
  storeRefreshToken: jest.fn(),
}));

// Mock business-repository before importing resolvers
jest.mock("../db/business-repository", () => ({
  findById: jest.fn(),
  updateNameById: jest.fn(),
}));

// Mock valkey-client
jest.mock("../valkey/valkey-client", () => ({
  storeRefreshToken: jest.fn(),
}));

import { updateBusiness } from "./resolvers";
import { verifyToken } from "../auth/auth-service";
import { updateNameById } from "../db/business-repository";

describe("updateBusiness resolver", () => {
  const mockBusinessId = "biz-123";
  const mockNewName = "Ace Cafe Updated";
  const mockUserId = "user-456";
  const mockToken = "valid-jwt-token";

  const mockContext = {
    headers: {
      authorization: `Bearer ${mockToken}`,
    },
  };

  const emptyContext = {
    headers: {},
  };

  const unauthorizedContext = {
    headers: {
      authorization: "InvalidToken",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("should reject request without authorization header", async () => {
    const result = await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      emptyContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authorization required");
  });

  it("should reject request with invalid token format (no Bearer prefix)", async () => {
    const result = await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      unauthorizedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authorization required");
  });

  it("should reject request with invalid token", async () => {
    const invalidTokenContext = {
      headers: {
        authorization: "Bearer invalid-token",
      },
    };

    (verifyToken as jest.Mock).mockImplementation(() => {
      throw new Error("Invalid token");
    });

    const result = await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      invalidTokenContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid or expired token");
  });

  it("should reject request with expired token", async () => {
    const expiredTokenContext = {
      headers: {
        authorization: "Bearer expired-token",
      },
    };

    (verifyToken as jest.Mock).mockImplementation(() => {
      throw new Error("Token expired");
    });

    const result = await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      expiredTokenContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid or expired token");
  });

  it("should reject when user is not the business owner", async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: "other-user-id" });
    (updateNameById as jest.Mock).mockResolvedValue(null);

    const result = await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Business not found or you are not the owner");
    // Resolver calls updateNameById(client, id, name, userId).
    expect(updateNameById).toHaveBeenCalledWith(mockDbClient, mockBusinessId, mockNewName, "other-user-id");
  });

  it("should reject when business does not exist", async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: mockUserId });
    (updateNameById as jest.Mock).mockResolvedValue(null);

    const result = await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Business not found or you are not the owner");
  });

  it("should successfully update business when user is owner", async () => {
    // The resolver reads a camelCase Business entity (businessToGraphqlBusiness
    // uses categoryId / verificationStatus / createdAt), not a raw snake_case row.
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: mockNewName,
      categoryId: "food-dining",
      verificationStatus: "unverified",
      createdAt: new Date("2024-01-01"),
    };

    (verifyToken as jest.Mock).mockReturnValue({ userId: mockUserId });
    (updateNameById as jest.Mock).mockResolvedValue(mockUpdatedBusiness);

    const result = await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.business).toBeDefined();
    expect(result.business).toEqual({
      id: mockBusinessId,
      name: mockNewName,
      categoryId: "food-dining",
      description: null,
      location: null,
      phone: null,
      website: null,
      rating: null,
      reviewCount: null,
      imageUrl: null,
      lat: null,
      lng: null,
      tags: [],
      source: null,
      verified: false,
      socialUrls: null,
      locations: [],
      createdAt: {
        timestamp: expect.any(Number),
      },
    });
    // Resolver calls updateNameById(client, id, name, userId).
    expect(updateNameById).toHaveBeenCalledWith(mockDbClient, mockBusinessId, mockNewName, mockUserId);
  });

  it("should call updateNameById with correct parameters", async () => {
    // The resolver reads a camelCase Business entity (businessToGraphqlBusiness
    // uses categoryId / verificationStatus / createdAt), not a raw snake_case row.
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: mockNewName,
      categoryId: "food-dining",
      verificationStatus: "unverified",
      createdAt: new Date("2024-01-01"),
    };

    (verifyToken as jest.Mock).mockReturnValue({ userId: mockUserId });
    (updateNameById as jest.Mock).mockResolvedValue(mockUpdatedBusiness);

    await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      mockContext
    );

    expect(updateNameById).toHaveBeenCalledTimes(1);
    // Resolver calls updateNameById(client, id, name, userId).
    expect(updateNameById).toHaveBeenCalledWith(mockDbClient, mockBusinessId, mockNewName, mockUserId);
  });
});
