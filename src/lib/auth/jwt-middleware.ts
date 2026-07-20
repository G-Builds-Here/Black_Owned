/**
 * JWT Authentication Middleware
 *
 * Validates Bearer tokens using RS256 signing and enforces role-based access control.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, isTokenExpired } from "./auth-service";
import { JwtPayload, UserRole } from "../../types/user";

/**
 * Authentication error types
 */
export type AuthErrorType = "NO_AUTH_HEADER" | "TOKEN_EXPIRED" | "INVALID_TOKEN" | "INSUFFICIENT_PERMISSIONS";

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  errorType?: AuthErrorType;
  errorMessage?: string;
  statusCode: number;
  user?: JwtPayload;
}

/**
 * Required roles for a route
 */
export type RequiredRole = UserRole;

/**
 * Create an authentication middleware factory
 *
 * @param requiredRoles - Array of roles that are allowed to access the route
 * @returns Middleware function
 */
export function createAuthMiddleware(requiredRoles: RequiredRole[] = ["user"]) {
  return async function authMiddleware(
    request: NextRequest
  ): Promise<AuthResult> {
    // Check for Authorization header
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return {
        authenticated: false,
        errorType: "NO_AUTH_HEADER",
        errorMessage: "Authorization header is required",
        statusCode: 401,
      };
    }

    // Extract Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return {
        authenticated: false,
        errorType: "INVALID_TOKEN",
        errorMessage: "Authorization header must be in format: Bearer <token>",
        statusCode: 401,
      };
    }

    const token = parts[1];

    // Check if token is expired before verification
    if (isTokenExpired(token)) {
      return {
        authenticated: false,
        errorType: "TOKEN_EXPIRED",
        errorMessage: "Token expired",
        statusCode: 401,
      };
    }

    // Verify the token
    try {
      const decoded = verifyToken(token);

      // Check role-based access control
      const userRole = decoded.role as UserRole;
      if (!requiredRoles.includes(userRole)) {
        return {
          authenticated: false,
          errorType: "INSUFFICIENT_PERMISSIONS",
          errorMessage: "Insufficient permissions",
          statusCode: 403,
        };
      }

      return {
        authenticated: true,
        user: decoded,
        statusCode: 200,
      };
    } catch (error) {
      // Token verification failed
      return {
        authenticated: false,
        errorType: "INVALID_TOKEN",
        errorMessage: "Invalid token",
        statusCode: 401,
      };
    }
  };
}

/**
 * Extract Bearer token from Authorization header
 * Returns null if no valid Bearer token is found
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }

  return null;
}

/**
 * Create an authentication error response
 */
export function createAuthErrorResponse(
  errorType: AuthErrorType,
  errorMessage: string
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: errorMessage,
    },
    {
      status: errorType === "INSUFFICIENT_PERMISSIONS" ? 403 : 401,
    }
  );
}
