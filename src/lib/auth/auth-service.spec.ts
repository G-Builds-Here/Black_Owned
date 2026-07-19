/**
 * Auth Service Tests
 */

import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyToken,
  BCRYPT_COST_FACTOR,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from "./auth-service";
import { User } from "../../types/user";

describe("Auth Service", () => {
  const mockUser: User = {
    id: "test-user-id",
    email: "test@example.com",
    passwordHash: "",
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const hash = await hashPassword("SecurePass123!");
      expect(hash).toBeDefined();
      expect(hash).not.toBe("SecurePass123!");
    });

    it("should use bcrypt cost factor 12", async () => {
      const hash = await hashPassword("SecurePass123!");
      // bcrypt hash format: $2a$12$ or $2b$12$
      expect(hash).toMatch(/^\$2[ab]\$12\$/);
    });

    it("should produce different hashes for same password", async () => {
      const hash1 = await hashPassword("SecurePass123!");
      const hash2 = await hashPassword("SecurePass123!");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
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

  describe("generateAccessToken", () => {
    it("should generate a valid JWT token", () => {
      process.env.JWT_SECRET = "test-secret-key";
      const token = generateAccessToken(mockUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("should include user data in payload", () => {
      process.env.JWT_SECRET = "test-secret-key";
      const token = generateAccessToken(mockUser);
      const decoded = verifyToken(token);
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a valid JWT token", () => {
      process.env.JWT_SECRET = "test-secret-key";
      const token = generateRefreshToken(mockUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });
  });

  describe("generateTokenPair", () => {
    it("should return both access and refresh tokens", () => {
      process.env.JWT_SECRET = "test-secret-key";
      const tokens = generateTokenPair(mockUser);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    it("should have different tokens", () => {
      process.env.JWT_SECRET = "test-secret-key";
      const tokens = generateTokenPair(mockUser);
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });
  });

  describe("verifyToken", () => {
    it("should verify a valid token", () => {
      process.env.JWT_SECRET = "test-secret-key";
      const token = generateAccessToken(mockUser);
      const decoded = verifyToken(token);
      expect(decoded.userId).toBe(mockUser.id);
    });

    it("should throw on invalid token", () => {
      process.env.JWT_SECRET = "test-secret-key";
      expect(() => verifyToken("invalid.token.here")).toThrow();
    });
  });

  describe("constants", () => {
    it("should have bcrypt cost factor 12", () => {
      expect(BCRYPT_COST_FACTOR).toBe(12);
    });

    it("should have access token expiry 15m", () => {
      expect(ACCESS_TOKEN_EXPIRY).toBe("15m");
    });

    it("should have refresh token expiry 7d", () => {
      expect(REFRESH_TOKEN_EXPIRY).toBe("7d");
    });
  });
});
