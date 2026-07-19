/**
 * Login GraphQL Resolvers
 */

import { findByEmail } from "../db/user-repository";
import { verifyPassword, generateTokenPair } from "../auth/auth-service";
import { storeRefreshToken } from "../valkey/valkey-client";

/**
 * Login mutation resolver
 */
export async function login(
  _parent: unknown,
  args: { email: string; password: string }
): Promise<{
  success: boolean;
  tokens?: { accessToken: string; refreshToken: string };
  user?: { id: string; email: string; name: string; createdAt: string };
  error?: string;
}> {
  const { email, password } = args;

  // Find user by email
  const user = await findByEmail(email.toLowerCase());

  if (!user) {
    // Use generic error to prevent email enumeration
    return {
      success: false,
      error: "Invalid credentials",
    };
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    return {
      success: false,
      error: "Invalid credentials",
    };
  }

  // Generate tokens
  const tokens = generateTokenPair(user);

  // Store refresh token in Valkey
  await storeRefreshToken(tokens.refreshToken, user.id);

  // Convert user to GraphQL type
  const graphqlUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };

  return {
    success: true,
    tokens,
    user: graphqlUser,
  };
}

/**
 * Resolvers object
 */
export const loginResolvers = {
  Mutation: {
    login,
  },
};
