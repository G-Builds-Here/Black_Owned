/**
 * Valkey Client
 *
 * Redis-compatible client for refresh token storage.
 */

import Redis from "ioredis";

/**
 * Valkey connection singleton
 */
let valkey: Redis | null = null;

/**
 * Get Valkey client instance
 */
export function getValkey(): Redis {
  if (valkey) {
    return valkey;
  }

  const host = process.env.VALKEY_HOST || "localhost";
  const port = parseInt(process.env.VALKEY_PORT || "6379", 10);

  valkey = new Redis({
    host,
    port,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  });

  return valkey;
}

/**
 * Store a refresh token with expiry
 * @param token - The refresh token
 * @param userId - The user ID
 * @param expirySeconds - Expiry time in seconds (default: 7 days)
 */
export async function storeRefreshToken(
  token: string,
  userId: string,
  expirySeconds: number = 7 * 24 * 60 * 60
): Promise<void> {
  const client = getValkey();
  await client.setex(`refresh:${token}`, expirySeconds, userId);
}

/**
 * Get user ID from a refresh token
 * @param token - The refresh token
 * @returns The user ID or null if not found
 */
export async function getRefreshTokenUserId(
  token: string
): Promise<string | null> {
  const client = getValkey();
  const userId = await client.get(`refresh:${token}`);
  return userId;
}

/**
 * Revoke a refresh token
 * @param token - The refresh token to revoke
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const client = getValkey();
  await client.del(`refresh:${token}`);
}

/**
 * Check if a refresh token is valid (exists in Valkey)
 * @param token - The refresh token
 * @returns True if the token exists
 */
export async function isRefreshTokenValid(token: string): Promise<boolean> {
  const client = getValkey();
  const exists = await client.exists(`refresh:${token}`);
  return exists === 1;
}

/**
 * Close the Valkey connection
 */
export async function closeValkey(): Promise<void> {
  if (valkey) {
    valkey.quit();
    valkey = null;
  }
}
