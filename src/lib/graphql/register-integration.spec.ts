/**
 * Registration Integration Tests with PostgreSQL Testcontainers
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
import { validatePassword, isValidEmail } from "../../types/user";

describe("Registration Integration Tests", () => {
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
  }, 60000);

  afterAll(async () => {
    await closePool();
    await postgres.stop();
  }, 30000);

  beforeEach(async () => {
    // Clean up users before each test
    await pool.query("DELETE FROM users");
  });

  describe("Password Validation", () => {
    it("should accept strong password", () => {
      const result = validatePassword("SecurePass123!");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject weak password", () => {
      const result = validatePassword("weak");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should validate email format", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("invalid")).toBe(false);
    });
  });

  describe("Password Hashing", () => {
    it("should hash password with bcrypt cost factor 12", async () => {
      const hash = await hashPassword("SecurePass123!");
      expect(hash).toMatch(/^\$2b\$12\$/);
    });

    it("should verify correct password", async () => {
      const password = "SecurePass123!";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const password = "SecurePass123!";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("WrongPassword1!", hash);
      expect(isValid).toBe(false);
    });
  });

  describe("User Registration", () => {
    it("should create a new user with hashed password", async () => {
      const email = "newuser@example.com";
      const password = "SecurePass123!";
      const name = "New User";

      const passwordHash = await hashPassword(password);
      const user = await create(email, passwordHash, name);

      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.name).toBe(name);
      expect(user.passwordHash).not.toBe(password);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it("should prevent duplicate email registration", async () => {
      const email = "duplicate@example.com";
      const passwordHash = await hashPassword("Password1!");

      // First registration should succeed
      await create(email, passwordHash, "User One");

      // Second registration should find existing user
      const existingUser = await findByEmail(email);
      expect(existingUser).not.toBeNull();
      expect(existingUser?.email).toBe(email);
    });

    it("should store password as bcrypt hash", async () => {
      const email = "hashed@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);

      await create(email, passwordHash, "Test User");

      const user = await findByEmail(email);
      expect(user).not.toBeNull();
      expect(user?.passwordHash).toMatch(/^\$2b\$12\$/);

      // Verify the hash works
      const isValid = await verifyPassword(password, user!.passwordHash);
      expect(isValid).toBe(true);
    });

    it("should normalize email to lowercase", async () => {
      const email = "UPPERCASE@EXAMPLE.COM";
      const passwordHash = await hashPassword("Password1!");

      await create(email, passwordHash, "Test User");

      const user = await findByEmail("uppercase@example.com");
      expect(user).not.toBeNull();
      expect(user?.email).toBe("uppercase@example.com");
    });

    it("should generate JWT tokens for registered user", async () => {
      process.env.JWT_SECRET = "test-secret-key";

      const email = "tokenuser@example.com";
      const password = "SecurePass123!";
      const passwordHash = await hashPassword(password);
      const user = await create(email, passwordHash, "Token User");

      const tokens = generateTokenPair(user);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });
  });

  describe("Registration Flow", () => {
    it("should complete full registration flow", async () => {
      process.env.JWT_SECRET = "test-secret-key";

      const email = "flowtest@example.com";
      const password = "SecurePass123!";
      const name = "Flow Test User";

      // Step 1: Validate password
      const passwordValidation = validatePassword(password);
      expect(passwordValidation.valid).toBe(true);

      // Step 2: Check for existing user
      const existingUser = await findByEmail(email);
      expect(existingUser).toBeNull();

      // Step 3: Hash password
      const passwordHash = await hashPassword(password);
      expect(passwordHash).toMatch(/^\$2b\$12\$/);

      // Step 4: Create user
      const user = await create(email, passwordHash, name);
      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);

      // Step 5: Generate tokens
      const tokens = generateTokenPair(user);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      // Step 6: Verify password works
      const isValid = await verifyPassword(password, user.passwordHash);
      expect(isValid).toBe(true);
    });

    it("should reject duplicate email in registration flow", async () => {
      const email = "flowduplicate@example.com";
      const passwordHash = await hashPassword("Password1!");

      // Create first user
      await create(email, passwordHash, "User One");

      // Attempt to register same email
      const existingUser = await findByEmail(email);
      expect(existingUser).not.toBeNull();

      // Should return "Email already registered" error
      expect(existingUser?.email).toBe(email);
    });
  });
});
