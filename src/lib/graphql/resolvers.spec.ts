/**
 * GraphQL Resolvers Tests - Registration
 */

import { register } from "./resolvers";
import { findByEmail, create, closePool } from "../db/user-repository";
import { hashPassword } from "../auth/auth-service";
import { validatePassword } from "../../types/user";

// Mock the database functions
jest.mock("../db/user-repository", () => ({
  findByEmail: jest.fn(),
  create: jest.fn(),
  closePool: jest.fn(),
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
