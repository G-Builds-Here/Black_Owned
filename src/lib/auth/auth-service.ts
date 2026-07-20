/**
 * Authentication Service
 *
 * Handles password hashing with bcrypt and JWT token generation using RS256.
 */

import bcrypt from "bcryptjs";
import jwt, { SignOptions, Secret, JwtPayload as JwtJsPayload } from "jsonwebtoken";
import { User, TokenPair, JwtPayload } from "../../types/user";
import * as fs from "fs";
import * as path from "path";

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
 * JWT signing algorithm (RS256 - asymmetric RSA)
 */
export const JWT_ALGORITHM = "RS256" as const;

/**
 * Get the private key for signing JWTs
 * Reads from environment variable or file system
 */
function getPrivateKey(): Secret {
  const keyFromEnv = process.env.JWT_PRIVATE_KEY;
  if (keyFromEnv) {
    return keyFromEnv;
  }

  const keyPath = process.env.JWT_PRIVATE_KEY_PATH || path.join(process.cwd(), "config", "jwt", "private.pem");
  try {
    return fs.readFileSync(keyPath, "utf8");
  } catch (error) {
    throw new Error(`JWT_PRIVATE_KEY not set and private key file not found at ${keyPath}`);
  }
}

/**
 * Get the public key for verifying JWTs
 * Reads from environment variable or file system
 */
function getPublicKey(): Secret {
  const keyFromEnv = process.env.JWT_PUBLIC_KEY;
  if (keyFromEnv) {
    return keyFromEnv;
  }

  const keyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(process.cwd(), "config", "jwt", "public.pem");
  try {
    return fs.readFileSync(keyPath, "utf8");
  } catch (error) {
    throw new Error(`JWT_PUBLIC_KEY not set and public key file not found at ${keyPath}`);
  }
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
 * Generate access token (15 min expiry) using RS256
 */
export function generateAccessToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role || "user",
  };

  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: JWT_ALGORITHM,
  };

  return jwt.sign(payload, getPrivateKey(), options);
}

/**
 * Generate refresh token (7 day expiry) using RS256
 */
export function generateRefreshToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role || "user",
  };

  const options: SignOptions = {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    algorithm: JWT_ALGORITHM,
  };

  return jwt.sign(payload, getPrivateKey(), options);
}

/**
 * Verify and decode a JWT token using RS256
 * Throws error on invalid or expired token
 */
export function verifyToken(token: string): JwtPayload {
  const options = {
    algorithms: [JWT_ALGORITHM],
  };

  return jwt.verify(token, getPublicKey(), options) as JwtPayload;
}

/**
 * Verify token without throwing - returns null on invalid/expired
 */
export function verifyTokenSafe(token: string): JwtPayload | null {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
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

/**
 * Check if a token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded.payload === "string") {
      return true;
    }
    const payload = decoded.payload as JwtJsPayload;
    return payload.exp !== undefined && payload.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}
