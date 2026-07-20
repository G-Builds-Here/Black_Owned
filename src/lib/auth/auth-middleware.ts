/**
 * JWT Authentication Middleware
 *
 * Provides middleware for protecting API routes with JWT token validation.
 */

import { NextApiRequest, NextApiResponse } from "next";
import jwt, { JwtPayload } from "jsonwebtoken";
import { UserRole } from "../../types/user-management";

/**
 * JWT secret from environment
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

/**
 * Extended JWT payload with role
 */
export interface AuthenticatedUser extends JwtPayload {
  userId: string;
  email: string;
  role?: UserRole;
}

/**
 * Authentication error types
 */
export type AuthError =
  | { type: "missing_token" }
  | { type: "invalid_token"; reason: string }
  | { type: "expired_token" }
  | { type: "insufficient_role"; required: UserRole };

/**
 * Extract token from request
 */
export function extractToken(request: NextApiRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Check query parameter
  if (request.query && (request.query as { token?: unknown }).token) {
    const tokenValue = (request.query as { token?: unknown }).token;
    return Array.isArray(tokenValue) ? tokenValue[0] : tokenValue as string;
  }

  // Check cookies
  const cookie = request.headers.cookie;
  if (cookie) {
    const match = cookie.match(/(^|;\s*)accessToken=([^;]*)/);
    if (match) {
      return match[2];
    }
  }

  return null;
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): AuthenticatedUser {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthenticatedUser;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw { type: "expired_token" } as AuthError;
    }
    throw {
      type: "invalid_token",
      reason: error instanceof Error ? error.message : "Unknown error",
    } as AuthError;
  }
}

/**
 * Authentication middleware factory
 */
export function requireAuth(
  handler: (
    req: NextApiRequest & { user: AuthenticatedUser },
    res: NextApiResponse
  ) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "MISSING_TOKEN",
      });
      return;
    }

    try {
      const user = verifyToken(token);
      (req as NextApiRequest & { user: AuthenticatedUser }).user = user;
      await handler(req as NextApiRequest & { user: AuthenticatedUser }, res);
    } catch (error) {
      const authError = error as AuthError;
      const status =
        authError.type === "expired_token" ? 401 :
        authError.type === "insufficient_role" ? 403 :
        401;

      res.status(status).json({
        success: false,
        error:
          authError.type === "expired_token"
            ? "Token expired"
            : authError.type === "insufficient_role"
            ? "Insufficient permissions"
            : "Invalid token",
        code: authError.type.toUpperCase(),
      });
    }
  };
}

/**
 * Role-based authorization middleware
 */
export function requireRole(
  requiredRole: UserRole
) {
  return (
    req: NextApiRequest & { user: AuthenticatedUser },
    res: NextApiResponse,
    next: () => void
  ): void => {
    const userRole = req.user.role || "user";

    const roleHierarchy: Record<UserRole, number> = {
      user: 1,
      business_owner: 2,
      admin: 3,
    };

    if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
      res.status(403).json({
        success: false,
        error: "Insufficient permissions for this action",
        code: "INSUFFICIENT_ROLE",
      });
      return;
    }

    next();
  };
}

/**
 * Optional authentication - attaches user if token present, continues without error if not
 */
export function optionalAuth(
  handler: (
    req: NextApiRequest & { user?: AuthenticatedUser },
    res: NextApiResponse
  ) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const token = extractToken(req);

    if (token) {
      try {
        const user = verifyToken(token);
        (req as NextApiRequest & { user?: AuthenticatedUser }).user = user;
      } catch {
        // Token invalid, continue without user
      }
    }

    await handler(req as NextApiRequest & { user?: AuthenticatedUser }, res);
  };
}
