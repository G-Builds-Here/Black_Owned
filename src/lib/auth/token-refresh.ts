/**
 * Token Refresh Service
 *
 * Handles refresh token validation and token pair rotation.
 */

import { verifyToken, generateAccessToken, generateRefreshToken } from "./auth-service";
import { getRefreshTokenUserId, storeRefreshToken, revokeRefreshToken } from "../valkey/valkey-client";
import { TokenPair } from "../../types/user";

/**
 * Refresh token result type
 */
export interface RefreshTokenResult {
  success: boolean;
  tokens?: TokenPair;
  error?: string;
}

/**
 * Refresh an access token using a valid refresh token
 *
 * Process:
 * 1. Validate the refresh token exists in Valkey
 * 2. Verify the JWT signature and expiry
 * 3. Generate a new access token (15 min)
 * 4. Rotate the refresh token (revoke old, create new)
 *
 * @param refreshToken - The refresh token to use
 * @returns Token pair on success, error on failure
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshTokenResult> {
  try {
    // Step 1: Check if refresh token exists in Valkey
    const userId = await getRefreshTokenUserId(refreshToken);
    if (!userId) {
      return {
        success: false,
        error: "Invalid or expired refresh token",
      };
    }

    // Step 2: Verify JWT signature and expiry
    try {
      const payload = verifyToken(refreshToken);
      if (payload.userId !== userId) {
        return {
          success: false,
          error: "Token user ID mismatch",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: "Invalid refresh token signature or expiry",
      };
    }

    // Step 3: Create a mock user object for token generation
    // We only have the userId from Valkey, so we create a minimal user
    const user = {
      id: userId,
      email: "", // Email not available from Valkey, will be set in access token from JWT
      passwordHash: "",
      name: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "user" as const,
      status: "active" as const,
    };

    // Step 4: Generate new access token
    const newAccessToken = generateAccessToken(user);

    // Step 5: Rotate refresh token - revoke old one
    await revokeRefreshToken(refreshToken);

    // Step 6: Generate and store new refresh token
    const newRefreshToken = generateRefreshToken(user);
    await storeRefreshToken(newRefreshToken, userId);

    return {
      success: true,
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    };
  } catch (error) {
    console.error("Token refresh error:", error);
    return {
      success: false,
      error: "Internal server error during token refresh",
    };
  }
}
