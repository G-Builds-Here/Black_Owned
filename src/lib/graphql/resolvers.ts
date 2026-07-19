/**
 * GraphQL Resolvers
 */

import {
  findByEmail,
  create,
  initializeUserSchema,
} from "../db/user-repository";
import {
  hashPassword,
  generateTokenPair,
} from "../auth/auth-service";
import {
  validatePassword,
  isValidEmail,
  User,
} from "../../types/user";
import { storeRefreshToken } from "../valkey/valkey-client";

/**
 * Convert User record to GraphQL User type
 */
function userToGraphqlUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Register mutation resolver
 */
export async function register(
  _parent: unknown,
  args: { email: string; password: string; name: string }
): Promise<{
  success: boolean;
  user?: unknown;
  tokens?: { accessToken: string; refreshToken: string };
  error?: string;
}> {
  const { email, password, name } = args;

  // Validate email format
  if (!isValidEmail(email)) {
    return {
      success: false,
      error: "Invalid email format",
    };
  }

  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.errors.join(", "),
    };
  }

  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase();

  // Check for existing user
  const existingUser = await findByEmail(normalizedEmail);
  if (existingUser) {
    return {
      success: false,
      error: "Email already registered",
    };
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await create(normalizedEmail, passwordHash, name);

  // Generate tokens
  const tokens = generateTokenPair(user);

  // Store refresh token in Valkey
  await storeRefreshToken(tokens.refreshToken, user.id);

  return {
    success: true,
    user: userToGraphqlUser(user),
    tokens,
  };
}

/**
 * Health check resolver
 */
export function health(): string {
  return "ok";
}

/**
 * Resolvers object
 */
export const resolvers = {
  Query: {
    health,
  },
  Mutation: {
    register,
  },
};
