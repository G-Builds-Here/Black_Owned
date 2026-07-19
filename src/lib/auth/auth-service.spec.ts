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
  verifyTokenSafe,
  isTokenExpired,
  BCRYPT_COST_FACTOR,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  JWT_ALGORITHM,
} from "./auth-service";
import { User, UserRole } from "../../types/user";
import { generateKeyPairSync } from "crypto";

// Generate RSA key pair for testing (only once per test run)
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

// Mock fs for key file reading - return private key for signing, public key for verification
let mockFsReturn: string;
jest.mock("fs", () => ({
  readFileSync: jest.fn().mockImplementation((path: string) => {
    // Return public key for public key file path, private key for private key file path
    if (typeof path === "string" && path.includes("public.pem")) {
      return publicKey as string;
    }
    return mockFsReturn || (privateKey as string);
  }),
}));

describe("Auth Service", () => {
  const mockUser: User = {
    id: "test-user-id",
    email: "test@example.com",
    passwordHash: "",
    name: "Test User",
    role: "user" as UserRole,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBusinessOwner: User = {
    id: "business-owner-id",
    email: "owner@example.com",
    passwordHash: "",
    name: "Business Owner",
    role: "business_owner" as UserRole,
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
      process.env.JWT_PRIVATE_KEY = privateKey as string;
      const token = generateAccessToken(mockUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("should include user data in payload", () => {
      process.env.JWT_PRIVATE_KEY = privateKey as string;
      const token = generateAccessToken(mockUser);
      // Decode without verification to check payload
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.userId).toBe(mockUser.id);
      expect(payload.email).toBe(mockUser.email);
      expect(payload.role).toBe("user");
    });

    it("should include business_owner role in token", () => {
      process.env.JWT_PRIVATE_KEY = privateKey as string;
      const token = generateAccessToken(mockBusinessOwner);
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.role).toBe("business_owner");
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a valid JWT token", () => {
      process.env.JWT_PRIVATE_KEY = privateKey as string;
      const token = generateRefreshToken(mockUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });
  });

  describe("generateTokenPair", () => {
    it("should return both access and refresh tokens", () => {
      process.env.JWT_PRIVATE_KEY = privateKey as string;
      const tokens = generateTokenPair(mockUser);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    it("should have different tokens", () => {
      process.env.JWT_PRIVATE_KEY = privateKey as string;
      const tokens = generateTokenPair(mockUser);
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });
  });

  describe("verifyToken", () => {
    it("should throw on invalid token", () => {
      process.env.JWT_PUBLIC_KEY = publicKey as string;
      expect(() => verifyToken("invalid.token.here")).toThrow();
    });
  });

  describe("verifyTokenSafe", () => {
    it("should return null on invalid token instead of throwing", () => {
      const result = verifyTokenSafe("invalid.token.here");
      expect(result).toBeNull();
    });
  });

  describe("isTokenExpired", () => {
    it("should return true for malformed token", () => {
      const result = isTokenExpired("not.a.valid.token");
      expect(result).toBe(true);
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

    it("should use RS256 algorithm", () => {
      expect(JWT_ALGORITHM).toBe("RS256");
    });
  });
});
