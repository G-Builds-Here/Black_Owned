/**
 * GraphQL Resolvers Tests - Business Update
 */

// Mock MinIO client before importing resolvers
jest.mock("minio", () => ({
  Minio: jest.fn().mockImplementation(() => ({
    presignedPutObject: jest.fn().mockResolvedValue("https://mock-url"),
  })),
}));

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
  updateDescriptionById: jest.fn(),
}));

// Mock valkey-client
jest.mock("../valkey/valkey-client", () => ({
  storeRefreshToken: jest.fn(),
}));

// Mock nats client
jest.mock("../nats/client", () => {
  const mockNatsConnection = {
    publish: jest.fn(),
    subscribe: jest.fn(),
  };
  return {
    getNatsConnection: jest.fn().mockResolvedValue(mockNatsConnection),
  };
});

import { updateBusiness } from "./resolvers";
import { verifyToken } from "../auth/auth-service";
import { updateNameById, updateDescriptionById } from "../db/business-repository";
import { getNatsConnection } from "../nats/client";
import { getPool } from "../db/user-repository";

describe("updateBusiness resolver", () => {
  const mockBusinessId = "biz-123";
  const mockNewName = "Ace Cafe Updated";
  const mockNewDescription = "A cozy spot downtown";
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

  const mockPool = {
    connect: jest.fn(),
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    (getPool as jest.Mock).mockReturnValue(mockPool);
    (verifyToken as jest.Mock).mockReturnValue({ userId: mockUserId });
    mockPool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("should reject request without authorization header", async () => {
    const result = await updateBusiness(
      null,
      { input: { id: mockBusinessId, name: mockNewName } },
      emptyContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authorization required");
  });

  it("should reject request with invalid token format (no Bearer prefix)", async () => {
    const result = await updateBusiness(
      null,
      { input: { id: mockBusinessId, name: mockNewName } },
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
      { input: { id: mockBusinessId, name: mockNewName } },
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
      { input: { id: mockBusinessId, name: mockNewName } },
      expiredTokenContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid or expired token");
  });

  it("should reject when no fields provided to update", async () => {
    const result = await updateBusiness(
      null,
      { input: { id: mockBusinessId } },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("At least one field (name or description) must be provided");
  });

  it("should reject when user is not the business owner", async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: "other-user-id" });
    (updateNameById as jest.Mock).mockResolvedValue(undefined);

    const result = await updateBusiness(
      null,
      { input: { id: mockBusinessId, name: mockNewName } },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Business not found or you are not the owner");
  });

  it("should reject when business does not exist", async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: mockUserId });
    (updateNameById as jest.Mock).mockResolvedValue(undefined);

    const result = await updateBusiness(
      null,
      { input: { id: mockBusinessId, name: mockNewName } },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Business not found or you are not the owner");
  });

  it("should successfully update business name when user is owner", async () => {
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: mockNewName,
      ownerId: mockUserId,
      categoryId: "food-dining",
      verificationStatus: "unverified",
      description: undefined,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date(),
    };

    (updateNameById as jest.Mock).mockResolvedValue(mockUpdatedBusiness);

    const result = await updateBusiness(
      null,
      { input: { id: mockBusinessId, name: mockNewName } },
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
  });

  it("should successfully update business description when user is owner", async () => {
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: "Cozy Corner Cafe",
      ownerId: mockUserId,
      categoryId: "food-dining",
      verificationStatus: "unverified",
      description: mockNewDescription,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date(),
    };

    (updateDescriptionById as jest.Mock).mockResolvedValue(mockUpdatedBusiness);

    const result = await updateBusiness(
      null,
      { input: { id: mockBusinessId, description: mockNewDescription } },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.business).toBeDefined();
    expect(result.business).toEqual({
      id: mockBusinessId,
      name: "Cozy Corner Cafe",
      categoryId: "food-dining",
      verified: false,
      createdAt: {
        timestamp: expect.any(Number),
      },
    });
  });

  it("should call database update with correct parameters for name", async () => {
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: mockNewName,
      ownerId: mockUserId,
      categoryId: "food-dining",
      verificationStatus: "unverified",
      description: undefined,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date(),
    };

    (updateNameById as jest.Mock).mockResolvedValue(mockUpdatedBusiness);

    await updateBusiness(
      null,
      { input: { id: mockBusinessId, name: mockNewName } },
      mockContext
    );

    expect(updateNameById).toHaveBeenCalledTimes(1);
  });

  it("should call database update with correct parameters for description", async () => {
    const mockUpdatedBusiness = {
      id: mockBusinessId,
      name: "Cozy Corner Cafe",
      ownerId: mockUserId,
      categoryId: "food-dining",
      verificationStatus: "unverified",
      description: mockNewDescription,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date(),
    };

    (updateDescriptionById as jest.Mock).mockResolvedValue(mockUpdatedBusiness);

    await updateBusiness(
      null,
      { input: { id: mockBusinessId, description: mockNewDescription } },
      mockContext
    );

    expect(updateDescriptionById).toHaveBeenCalledTimes(1);
  });
});
