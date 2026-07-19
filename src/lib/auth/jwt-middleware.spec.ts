/**
 * JWT Middleware Tests
 */

import { NextRequest, NextResponse } from "../../../__mocks__/next-server";
import {
  createAuthMiddleware,
  extractBearerToken,
  createAuthErrorResponse,
  type AuthResult,
} from "./jwt-middleware";
import { verifyToken, isTokenExpired, generateAccessToken } from "./auth-service";
import { User, UserRole } from "../../types/user";

// Mock the auth-service functions
jest.mock("./auth-service", () => {
  const actualAuth = jest.requireActual("./auth-service");
  return {
    ...actualAuth,
    verifyToken: jest.fn(),
    isTokenExpired: jest.fn(),
  };
});

describe("JWT Middleware", () => {
  const mockUser: User = {
    id: "test-user-id",
    email: "test@example.com",
    passwordHash: "hash",
    name: "Test User",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBusinessOwner: User = {
    id: "business-owner-id",
    email: "owner@example.com",
    passwordHash: "hash",
    name: "Business Owner",
    role: "business_owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("createAuthMiddleware - No Authorization Header", () => {
    it("should return 401 when no Authorization header is present", async () => {
      const middleware = createAuthMiddleware();
      const request = new NextRequest("http://localhost/api/test");

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(false);
      expect(result.errorType).toBe("NO_AUTH_HEADER");
      expect(result.errorMessage).toBe("Authorization header is required");
      expect(result.statusCode).toBe(401);
    });
  });

  describe("createAuthMiddleware - Invalid Token Format", () => {
    it("should return 401 when Authorization header is not Bearer format", async () => {
      const middleware = createAuthMiddleware();
      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "InvalidToken",
        },
      });

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(false);
      expect(result.errorType).toBe("INVALID_TOKEN");
      expect(result.statusCode).toBe(401);
    });

    it("should return 401 when Authorization header has wrong scheme", async () => {
      const middleware = createAuthMiddleware();
      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Basic dXNlcjpwYXNz",
        },
      });

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(false);
      expect(result.errorType).toBe("INVALID_TOKEN");
      expect(result.statusCode).toBe(401);
    });
  });

  describe("createAuthMiddleware - Expired Token", () => {
    it("should return 401 with 'Token expired' message for expired token", async () => {
      (isTokenExpired as jest.Mock).mockReturnValue(true);

      const middleware = createAuthMiddleware();
      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer expired-token-here",
        },
      });

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(false);
      expect(result.errorType).toBe("TOKEN_EXPIRED");
      expect(result.errorMessage).toBe("Token expired");
      expect(result.statusCode).toBe(401);
    });
  });

  describe("createAuthMiddleware - Invalid Token", () => {
    it("should return 401 when token verification fails", async () => {
      (isTokenExpired as jest.Mock).mockReturnValue(false);
      (verifyToken as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      const middleware = createAuthMiddleware();
      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(false);
      expect(result.errorType).toBe("INVALID_TOKEN");
      expect(result.errorMessage).toBe("Invalid token");
      expect(result.statusCode).toBe(401);
    });
  });

  describe("createAuthMiddleware - Role-Based Access Control", () => {
    it("should return 403 with 'Insufficient permissions' for user without required role", async () => {
      (isTokenExpired as jest.Mock).mockReturnValue(false);
      (verifyToken as jest.Mock).mockReturnValue({
        userId: mockUser.id,
        email: mockUser.email,
        role: "user",
      });

      // Middleware requires business_owner role
      const middleware = createAuthMiddleware(["business_owner"]);
      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(false);
      expect(result.errorType).toBe("INSUFFICIENT_PERMISSIONS");
      expect(result.errorMessage).toBe("Insufficient permissions");
      expect(result.statusCode).toBe(403);
    });

    it("should allow access when user has required role", async () => {
      (isTokenExpired as jest.Mock).mockReturnValue(false);
      (verifyToken as jest.Mock).mockReturnValue({
        userId: mockBusinessOwner.id,
        email: mockBusinessOwner.email,
        role: "business_owner",
      });

      const middleware = createAuthMiddleware(["business_owner"]);
      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(true);
      expect(result.user?.userId).toBe(mockBusinessOwner.id);
      expect(result.statusCode).toBe(200);
    });

    it("should allow access when user has admin role (higher privilege)", async () => {
      (isTokenExpired as jest.Mock).mockReturnValue(false);
      (verifyToken as jest.Mock).mockReturnValue({
        userId: "admin-id",
        email: "admin@example.com",
        role: "admin",
      });

      const middleware = createAuthMiddleware(["admin"]);
      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      const result: AuthResult = await middleware(request);

      expect(result.authenticated).toBe(true);
      expect(result.user?.role).toBe("admin");
    });
  });

  describe("extractBearerToken", () => {
    it("should extract token from valid Bearer header", () => {
      const token = extractBearerToken("Bearer my-token-here");
      expect(token).toBe("my-token-here");
    });

    it("should return null for missing header", () => {
      const token = extractBearerToken(null);
      expect(token).toBeNull();
    });

    it("should return null for invalid format", () => {
      const token = extractBearerToken("InvalidToken");
      expect(token).toBeNull();
    });
  });

  describe("createAuthErrorResponse", () => {
    it("should create 401 response for NO_AUTH_HEADER", () => {
      const response = createAuthErrorResponse(
        "NO_AUTH_HEADER",
        "Authorization header is required"
      );

      expect(response.status).toBe(401);
    });

    it("should create 403 response for INSUFFICIENT_PERMISSIONS", () => {
      const response = createAuthErrorResponse(
        "INSUFFICIENT_PERMISSIONS",
        "Insufficient permissions"
      );

      expect(response.status).toBe(403);
    });

    it("should include error message in response body", async () => {
      const response = createAuthErrorResponse(
        "TOKEN_EXPIRED",
        "Token expired"
      );

      const body = await response.json();
      expect(body).toEqual(
        expect.objectContaining({
          success: false,
          error: "Token expired",
        })
      );
    });
  });
});
