/**
 * User Management Repository
 *
 * PostgreSQL data access layer for user management operations including
 * role assignment, status management, and paginated listing with search.
 */

import { Pool, PoolClient } from "pg";
import {
  UserWithRole,
  UserRole,
  UserStatus,
  GetUserListInput,
  UserListResult,
} from "../../types/user-management";
import { getPool } from "./user-repository";

/**
 * Initialize user management schema with role and status columns
 */
export async function initializeUserManagementSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    // Add role and status columns if they don't exist
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'
    `);

    // Create index on role for filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
    `);

    // Create index on status for filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)
    `);
  } finally {
    client.release();
  }
}

/**
 * Update user role
 */
export async function updateUserRole(
  userId: string,
  role: UserRole
): Promise<UserWithRole | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<UserWithRole>(
      `UPDATE users
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [role, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Update user status
 */
export async function updateUserStatus(
  userId: string,
  status: UserStatus
): Promise<UserWithRole | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<UserWithRole>(
      `UPDATE users
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get user by ID with role and status
 */
export async function findByIdWithRole(
  id: string
): Promise<UserWithRole | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<UserWithRole>(
      `SELECT id, email, name as "displayName", role, status, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get users with pagination and optional email search
 */
export async function getUsersPaginated(
  input: GetUserListInput
): Promise<UserListResult> {
  const { page, pageSize, emailSearch } = input;
  const offset = (page - 1) * pageSize;

  const client = await getPool().connect();
  try {
    // Build query with optional search
    let countQuery = "SELECT COUNT(*) FROM users";
    let mainQuery = `
      SELECT id, email, name as "displayName", role, status, created_at, updated_at
      FROM users
    `;
    const countParams: unknown[] = [];
    const mainParams: unknown[] = [];

    if (emailSearch) {
      countQuery += " WHERE email ILIKE $1";
      mainQuery += " WHERE email ILIKE $1";
      countParams.push(`%${emailSearch}%`);
      mainParams.push(`%${emailSearch}%`);
    }

    // Get total count
    const countResult = await client.query<{ count: string }>(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    mainQuery += ` ORDER BY created_at DESC LIMIT $${mainParams.length + 1} OFFSET $${mainParams.length + 2}`;
    mainParams.push(pageSize, offset);

    const result = await client.query<UserWithRole>(mainQuery, mainParams);

    const totalPages = Math.ceil(total / pageSize);

    return {
      users: result.rows,
      total,
      page,
      pageSize,
      totalPages,
    };
  } finally {
    client.release();
  }
}

/**
 * Get user count by role
 */
export async function getUserCountByRole(role: UserRole): Promise<number> {
  const client = await getPool().connect();
  try {
    const result = await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM users WHERE role = $1",
      [role]
    );
    return parseInt(result.rows[0].count, 10);
  } finally {
    client.release();
  }
}

/**
 * Get user count by status
 */
export async function getUserCountByStatus(status: UserStatus): Promise<number> {
  const client = await getPool().connect();
  try {
    const result = await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM users WHERE status = $1",
      [status]
    );
    return parseInt(result.rows[0].count, 10);
  } finally {
    client.release();
  }
}
