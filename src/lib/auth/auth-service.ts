/**
 * Authentication Service
 *
 * Handles password hashing with bcrypt and JWT token generation.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, TokenPair, JwtPayload } from "../../types/user";

/**
 * Bcrypt cost factor for password hashing
 */
export const BCRYPT_COST_FACTOR = 12;

/**
 * Access token expiry (15 minutes)
 */
export const ACCESS_TOKEN_EXPIRY = "15m";

/**
 * Refresh token expiry (7 days)
 */
export const REFRESH_TOKEN_EXPIRY = "7d";

/**
 * JWT secret - must be set via environment variable
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

/**
 * Hash a password using bcrypt with cost factor 12
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate access token (15 min expiry)
 */
export function generateAccessToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/**
 * Generate refresh token (7 day expiry)
 */
export function generateRefreshToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}

/**
 * Generate token pair for a user
 */
export function generateTokenPair(user: User): TokenPair {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
}
