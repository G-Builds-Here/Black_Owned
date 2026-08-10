/**
 * GraphQL Resolvers Tests - Registration and Business Creation
 */

// Mock minio-service before importing resolvers
jest.mock("../minio/minio-service", () => ({
  MinioService: {},
  createMinioServiceFromEnv: jest.fn(),
}));

import { register, createBusiness } from "./resolvers";
import { findByEmail, create, closePool, getPool } from "../db/user-repository";
import { hashPassword } from "../auth/auth-service";
import { validatePassword } from "../../types/user";

// Mock the database functions
jest.mock("../db/user-repository", () => {
  const mockPool = {
    connect: jest.fn(),
  };
  return {
    findByEmail: jest.fn(),
    create: jest.fn(),
    closePool: jest.fn(),
    initializeUserSchema: jest.fn(),
    getPool: jest.fn(() => mockPool),
  };
});

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

describe("createBusiness resolver", () => {
  const mockContext = {
    user: { id: "user-123" },
  };

  const mockArgs = {
    input: {
      name: "Test Business",
      description: "Test description",
      categoryId: "cat-1",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject request when user is not authenticated", async () => {
    const result = await createBusiness(
      null,
      mockArgs,
      { user: undefined }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authentication required");
  });

  it("should reject when name is missing", async () => {
    const result = await createBusiness(
      null,
      { input: { name: "", description: "Test", categoryId: "cat-1" } },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Name is required");
  });

  it("should reject when category ID is missing", async () => {
    const result = await createBusiness(
      null,
      { input: { name: "Test", description: "Test", categoryId: "" } },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Category ID is required");
  });

  it("should successfully create a business", async () => {
    const mockBusiness = {
      id: "biz-123",
      ownerId: "user-123",
      name: "Test Business",
      description: "Test description",
      categoryId: "cat-1",
      verificationStatus: "unverified",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    };

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockBusiness] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockReturnValue(mockClient),
    });

    const result = await createBusiness(null, mockArgs, mockContext);

    expect(result.success).toBe(true);
    expect(result.business).toBeDefined();
    expect(result.business.name).toBe("Test Business");
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("should rollback transaction when insert fails", async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("Duplicate key violation")), // INSERT fails
      release: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockReturnValue(mockClient),
    });

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    const result = await createBusiness(
      null,
      mockArgs,
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to create business");
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("should log error with business details on failure", async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("Constraint violation")), // INSERT fails
      release: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockReturnValue(mockClient),
    });

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    await createBusiness(
      null,
      mockArgs,
      mockContext
    );

    // Verify error was logged with business details
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Business creation failed - transaction rolled back:",
      expect.stringContaining("createBusiness")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Business creation failed - transaction rolled back:",
      expect.stringContaining("user-123")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Business creation failed - transaction rolled back:",
      expect.stringContaining("Test Business")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Business creation failed - transaction rolled back:",
      expect.stringContaining("cat-1")
    );

    consoleErrorSpy.mockRestore();
  });

  it("should handle rollback failure gracefully", async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("Insert failed")) // INSERT fails
        .mockRejectedValueOnce(new Error("Rollback failed")), // ROLLBACK fails
      release: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockReturnValue(mockClient),
    });

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    const result = await createBusiness(null, mockArgs, mockContext);

    expect(result.success).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Rollback failed:", expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it("should trim whitespace from input fields", async () => {
    const mockBusiness = {
      id: "biz-123",
      owner_id: "user-123",
      name: "Test Business",
      description: "Test",
      category_id: "cat-1",
      verification_status: "unverified",
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockBusiness] }) // INSERT
        .mockResolvedValueOnce({}), // COMMIT
      release: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockReturnValue(mockClient),
    });

    await createBusiness(
      null,
      { input: { name: "  Test Business  ", description: "  Test  ", categoryId: "  cat-1  " } },
      mockContext
    );

    // Verify trimmed values were passed to the database (note: 'unverified' is hardcoded in SQL, not passed as param)
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO businesses"),
      ["user-123", "Test Business", "Test", "cat-1"]
    );
  });
});
