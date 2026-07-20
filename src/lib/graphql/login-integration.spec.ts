/**
 * Login Integration Tests with PostgreSQL Testcontainers
 */

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import {
  findByEmail,
  create,
  initializeUserSchema,
  closePool,
  getPool,
} from "../db/user-repository";
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
} from "../auth/auth-service";
import { validatePassword } from "../../types/user";
import { storeRefreshToken, isRefreshTokenValid } from "../valkey/valkey-client";

describe("Login Integration Tests", () => {
  let postgres: PostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    // Start PostgreSQL container
    postgres = await new PostgreSqlContainer("postgres:15-alpine")
      .withDatabase("test_db")
      .withUsername("test_user")
      .withPassword("test_password")
      .start();

    // Set environment variables for the pool
    process.env.DATABASE_URL = postgres.getConnectionUri();

    // Initialize the pool and schema
    pool = getPool();
    await initializeUserSchema();

    // Set JWT secret for tests
    process.env.JWT_SECRET = "test-secret-key-for-login-tests";
  }, 60000);

  afterAll(async () => {
    await closePool();
    await postgres.stop();
  }, 30000);

  beforeEach(async () => {
    // Clean up users and valkey before each test
    await pool.query("DELETE FROM users");
  });

  describe("Login Validation", () => {
    it("should reject login with non-existent user", async () => {
      const result = await login("nonexistent@example.com", "Password1!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
      expect(result.tokens).toBeUndefined();
      expect(result.user).toBeUndefined();
    });

    it("should reject login with incorrect password", async () => {
      // Create a user first
      const email = "testuser@example.com";
      const passwordHash = await hashPassword("CorrectPassword1!");
      await create(email, passwordHash, "Test User");

      const result = await login(email, "WrongPassword1!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("should accept login with correct credentials", async () => {
      const email = "validuser@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "Valid User");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe(email);
      expect(result.user?.name).toBe("Valid User");
    });
  });

  describe("Token Generation", () => {
    it("should generate valid JWT access token", async () => {
      const email = "tokenuser@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      const user = await create(email, passwordHash, "Token User");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).toBeDefined();

      // Verify token format (JWT has 3 parts)
      const accessTokenParts = result.tokens!.accessToken.split(".");
      expect(accessTokenParts).toHaveLength(3);
    });

    it("should generate valid JWT refresh token", async () => {
      const email = "refreshuser@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "Refresh User");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.tokens?.refreshToken).toBeDefined();

      // Verify token format (JWT has 3 parts)
      const refreshTokenParts = result.tokens!.refreshToken.split(".");
      expect(refreshTokenParts).toHaveLength(3);
    });

    it("should store refresh token in Valkey", async () => {
      const email = "valkeyuser@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      const user = await create(email, passwordHash, "Valkey User");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.tokens?.refreshToken).toBeDefined();

      // Verify refresh token is stored in Valkey
      const isValid = await isRefreshTokenValid(result.tokens!.refreshToken);
      expect(isValid).toBe(true);
    });

    it("should generate different access and refresh tokens", async () => {
      const email = "differentuser@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "Different User");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).not.toBe(result.tokens?.refreshToken);
    });
  });

  describe("User Data Return", () => {
    it("should return user id on successful login", async () => {
      const email = "userdata@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      const createdUser = await create(email, passwordHash, "User Data Test");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe(createdUser.id);
    });

    it("should return user email on successful login", async () => {
      const email = "useremail@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "User Email Test");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe(email);
    });

    it("should return user name on successful login", async () => {
      const email = "username@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "John Doe");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.user?.name).toBe("John Doe");
    });

    it("should return user createdAt timestamp on successful login", async () => {
      const email = "usercreated@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "User Created Test");

      const result = await login(email, password);

      expect(result.success).toBe(true);
      expect(result.user?.createdAt).toBeDefined();

      // Verify it's a valid ISO timestamp
      const createdAt = new Date(result.user!.createdAt);
      expect(createdAt.toString()).not.toBe("Invalid Date");
    });
  });

  describe("Login Security", () => {
    it("should normalize email to lowercase for login", async () => {
      const email = "lowercase@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "Lowercase User");

      // Login with uppercase email
      const result = await login("LOWERCASE@EXAMPLE.COM", password);

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe(email);
    });

    it("should use generic error message for non-existent user", async () => {
      const result = await login("notexist@example.com", "AnyPassword1!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("should use generic error message for wrong password", async () => {
      const email = "wrongpass@example.com";
      const passwordHash = await hashPassword("CorrectPass1!");
      await create(email, passwordHash, "Wrong Pass User");

      const result = await login(email, "WrongPassword1!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });
  });

  describe("Full Login Flow", () => {
    it("should complete full login flow", async () => {
      const email = "fullflow@example.com";
      const password = "SecurePass123!";
      const name = "Full Flow User";

      // Step 1: Register user
      const passwordHash = await hashPassword(password);
      const user = await create(email, passwordHash, name);

      // Step 2: Login
      const result = await login(email, password);

      // Step 3: Verify login success
      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.user).toBeDefined();

      // Step 4: Verify user data matches
      expect(result.user?.id).toBe(user.id);
      expect(result.user?.email).toBe(email);
      expect(result.user?.name).toBe(name);

      // Step 5: Verify refresh token is stored
      const isValid = await isRefreshTokenValid(result.tokens!.refreshToken);
      expect(isValid).toBe(true);

      // Step 6: Verify token format
      const accessTokenParts = result.tokens!.accessToken.split(".");
      const refreshTokenParts = result.tokens!.refreshToken.split(".");
      expect(accessTokenParts).toHaveLength(3);
      expect(refreshTokenParts).toHaveLength(3);
    });

    it("should allow multiple login attempts for same user", async () => {
      const email = "multiplelogin@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      await create(email, passwordHash, "Multiple Login User");

      // First login
      const result1 = await login(email, password);
      expect(result1.success).toBe(true);

      // Second login
      const result2 = await login(email, password);
      expect(result2.success).toBe(true);

      // Tokens should be different each time
      expect(result1.tokens?.accessToken).not.toBe(result2.tokens?.accessToken);
      expect(result1.tokens?.refreshToken).not.toBe(result2.tokens?.refreshToken);
    });
  });
});

/**
 * Login function wrapper for tests
 */
async function login(
  email: string,
  password: string
): Promise<{
  success: boolean;
  tokens?: { accessToken: string; refreshToken: string };
  user?: { id: string; email: string; name: string; createdAt: string };
  error?: string;
}> {
  const { findByEmail } = await import("../db/user-repository");
  const { verifyPassword, generateTokenPair } = await import("../auth/auth-service");
  const { storeRefreshToken } = await import("../valkey/valkey-client");

  const user = await findByEmail(email.toLowerCase());

  if (!user) {
    return {
      success: false,
      error: "Invalid credentials",
    };
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    return {
      success: false,
      error: "Invalid credentials",
    };
  }

  const tokens = generateTokenPair(user);
  await storeRefreshToken(tokens.refreshToken, user.id);

  return {
    success: true,
    tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
  };
}
