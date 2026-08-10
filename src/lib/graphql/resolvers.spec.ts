/**
 * GraphQL Resolvers Tests - Registration
 */

import { register, approveBusinesses, pendingBusinesses } from "./resolvers";
import { findByEmail, create, closePool } from "../db/user-repository";
import { hashPassword } from "../auth/auth-service";
import { validatePassword } from "../../types/user";

// Mock the database functions
jest.mock("../db/user-repository", () => ({
  findByEmail: jest.fn(),
  create: jest.fn(),
  closePool: jest.fn(),
  initializeUserSchema: jest.fn(),
}));

jest.mock("../auth/auth-service", () => ({
  hashPassword: jest.fn(),
  generateTokenPair: jest.fn(() => ({
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
  })),
}));

jest.mock("../valkey/valkey-client", () => ({
  storeRefreshToken: jest.fn(),
}));

describe("register resolver", () => {
  const mockArgs = {
    email: "newuser@example.com",
    password: "SecurePass123!",
    name: "New User",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("should reject invalid email format", async () => {
    const result = await register(null, {
      email: "notanemail",
      password: "SecurePass123!",
      name: "Test User",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid email format");
  });

  it("should reject weak passwords", async () => {
    const result = await register(null, {
      email: "test@example.com",
      password: "weak",
      name: "Test User",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Password must be at least 8 characters long");
  });

  it("should reject duplicate email", async () => {
    (findByEmail as jest.Mock).mockResolvedValue({
      id: "existing-id",
      email: "existing@example.com",
      passwordHash: "hash",
      name: "Existing User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await register(null, {
      email: "existing@example.com",
      password: "SecurePass123!",
      name: "Duplicate User",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Email already registered");
  });

  it("should successfully register a new user", async () => {
    const mockHash = "hashed-password";
    const mockUser = {
      id: "new-user-id",
      email: "newuser@example.com",
      passwordHash: mockHash,
      name: "New User",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (findByEmail as jest.Mock).mockResolvedValue(null);
    (hashPassword as jest.Mock).mockResolvedValue(mockHash);
    (create as jest.Mock).mockResolvedValue(mockUser);

    const result = await register(null, mockArgs);

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.tokens).toBeDefined();
    expect(result.user.email).toBe("newuser@example.com");
    expect(result.user.name).toBe("New User");
  });

  it("should hash password with bcrypt", async () => {
    (findByEmail as jest.Mock).mockResolvedValue(null);
    (hashPassword as jest.Mock).mockResolvedValue("hashed-password");
    (create as jest.Mock).mockResolvedValue({
      id: "user-id",
      email: "test@example.com",
      passwordHash: "hashed-password",
      name: "Test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await register(null, mockArgs);

    expect(hashPassword).toHaveBeenCalledWith("SecurePass123!");
  });

  it("should create user in database", async () => {
    (findByEmail as jest.Mock).mockResolvedValue(null);
    (hashPassword as jest.Mock).mockResolvedValue("hashed-password");
    (create as jest.Mock).mockResolvedValue({
      id: "user-id",
      email: "newuser@example.com",
      passwordHash: "hashed-password",
      name: "New User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await register(null, mockArgs);

    expect(create).toHaveBeenCalledWith(
      "newuser@example.com",
      "hashed-password",
      "New User"
    );
  });

  it("should normalize email to lowercase", async () => {
    (findByEmail as jest.Mock).mockResolvedValue(null);
    (hashPassword as jest.Mock).mockResolvedValue("hashed-password");
    (create as jest.Mock).mockResolvedValue({
      id: "user-id",
      email: "newuser@example.com",
      passwordHash: "hashed-password",
      name: "New User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await register(null, {
      email: "NEWUSER@EXAMPLE.COM",
      password: "SecurePass123!",
      name: "New User",
    });

    expect(create).toHaveBeenCalledWith(
      "newuser@example.com",
      "hashed-password",
      "New User"
    );
  });
});

describe("validatePassword", () => {
  it("should accept strong password", () => {
    const result = validatePassword("SecurePass123!");
    expect(result.valid).toBe(true);
  });

  it("should reject password without uppercase", () => {
    const result = validatePassword("securepass123!");
    expect(result.valid).toBe(false);
  });

  it("should reject password without lowercase", () => {
    const result = validatePassword("SECUREPASS123!");
    expect(result.valid).toBe(false);
  });

  it("should reject password without digit", () => {
    const result = validatePassword("SecurePass!");
    expect(result.valid).toBe(false);
  });

  it("should reject password without special character", () => {
    const result = validatePassword("SecurePass123");
    expect(result.valid).toBe(false);
  });
});

// Mock database pool for business resolver tests
const mockQuery = jest.fn();
const mockPool = {
  connect: jest.fn(() => ({
    query: mockQuery,
    release: jest.fn(),
  })),
};

jest.mock("../db/user-repository", () => ({
  ...jest.requireActual("../db/user-repository"),
  getPool: () => mockPool,
}));

describe("approveBusinesses resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject empty business IDs array", async () => {
    const result = await approveBusinesses(null, { businessIds: [] });

    expect(result.success).toBe(false);
    expect(result.approvedCount).toBe(0);
    expect(result.error).toBe("No business IDs provided");
  });

  it("should approve a single business successfully", async () => {
    const businessId = "test-business-id";
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: businessId }],
    });

    const result = await approveBusinesses(null, { businessIds: [businessId] });

    expect(result.success).toBe(true);
    expect(result.approvedCount).toBe(1);
    expect(result.failedIds).toEqual([]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE"),
      [businessId]
    );
  });

  it("should approve multiple businesses successfully", async () => {
    const businessIds = ["id-1", "id-2", "id-3"];
    mockQuery.mockResolvedValue({ rows: [{ id: "test-id" }] });

    const result = await approveBusinesses(null, { businessIds });

    expect(result.success).toBe(true);
    expect(result.approvedCount).toBe(3);
    expect(result.failedIds).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it("should track failed approvals when business not found", async () => {
    const businessIds = ["existing-id", "non-existing-id"];
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "existing-id" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await approveBusinesses(null, { businessIds });

    expect(result.success).toBe(true);
    expect(result.approvedCount).toBe(1);
    expect(result.failedIds).toEqual(["non-existing-id"]);
  });

  it("should handle database errors gracefully", async () => {
    const businessIds = ["error-id"];
    mockQuery.mockRejectedValueOnce(new Error("Database connection failed"));

    const result = await approveBusinesses(null, { businessIds });

    expect(result.success).toBe(false);
    expect(result.approvedCount).toBe(0);
    expect(result.failedIds).toEqual(["error-id"]);
  });
});

describe("pendingBusinesses resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return empty array when no pending businesses", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await pendingBusinesses();

    expect(result).toEqual([]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("SELECT")
    );
  });

  it("should return pending businesses with correct format", async () => {
    const mockRows = [
      {
        id: "business-1",
        name: "Test Business",
        category_id: "cat-1",
        verification_status: "unverified",
        created_at: new Date("2024-01-01"),
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: mockRows });

    const result = await pendingBusinesses();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "business-1",
      name: "Test Business",
      categoryId: "cat-1",
      verified: false,
      createdAt: { timestamp: 1704067200 },
      phone: undefined,
      potentialDuplicateId: undefined,
    });
  });

  it("should handle database errors gracefully", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Database error"));

    const result = await pendingBusinesses();

    expect(result).toEqual([]);
  });
});
