/**
 * GraphQL Resolvers Tests - Business Update
 */

// Mock user-repository before importing resolvers (to prevent pg module loading)
jest.mock("../db/user-repository", () => ({
  findByEmail: jest.fn(),
  create: jest.fn(),
  initializeUserSchema: jest.fn(),
  closePool: jest.fn(),
  getPool: jest.fn(),
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
    expect(updateNameById).toHaveBeenCalledWith(mockBusinessId, mockNewName, "other-user-id");
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
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: mockNewName,
      owner_id: mockUserId,
      category_id: "food-dining",
      verified: false,
      created_at: new Date("2024-01-01"),
      updated_at: new Date(),
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
      verified: false,
      createdAt: {
        timestamp: expect.any(Number),
      },
    });
    expect(updateNameById).toHaveBeenCalledWith(mockBusinessId, mockNewName, mockUserId);
  });

  it("should call updateNameById with correct parameters", async () => {
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: mockNewName,
      owner_id: mockUserId,
      category_id: "food-dining",
      verified: false,
      created_at: new Date("2024-01-01"),
      updated_at: new Date(),
    };

    (verifyToken as jest.Mock).mockReturnValue({ userId: mockUserId });
    (updateNameById as jest.Mock).mockResolvedValue(mockUpdatedBusiness);

    await updateBusiness(
      null,
      { id: mockBusinessId, name: mockNewName },
      mockContext
    );

    expect(updateNameById).toHaveBeenCalledTimes(1);
    expect(updateNameById).toHaveBeenCalledWith(mockBusinessId, mockNewName, mockUserId);
  });
});
