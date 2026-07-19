/**
 * User Types
 *
 * Defines the data structures for user authentication.
 */

/**
 * User roles for access control
 */
export type UserRole = "user" | "business_owner" | "admin";

/**
 * User record stored in PostgreSQL
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * JWT payload structure
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Token pair returned on successful registration/login
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Register input validation schema
 */
export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

/**
 * Registration result
 */
export interface RegisterResult {
  user: User;
  tokens: TokenPair;
}

/**
 * Password validation result
 */
export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates password strength requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one digit");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
