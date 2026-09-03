/**
 * User Repository
 *
 * PostgreSQL data access layer for user operations.
 */

import { Pool, PoolClient } from "pg";
import { User, UserRole, UserStatus } from "../../types/user";

/**
 * PostgreSQL connection pool
 * Configured via environment variables:
 * - DATABASE_URL: Connection string
 * - POSTGRES_HOST: Hostname
 * - POSTGRES_PORT: Port (default: 5432)
 * - POSTGRES_DB: Database name
 * - POSTGRES_USER: Username
 * - POSTGRES_PASSWORD: Password
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5432", 10);
  const database = process.env.POSTGRES_DB || "black_owned";
  const user = process.env.POSTGRES_USER || "postgres";
  const password = process.env.POSTGRES_PASSWORD || "postgres";

  // Use DATABASE_URL if provided, otherwise construct from individual env vars
  const connectionString = process.env.DATABASE_URL
    ? process.env.DATABASE_URL
    : `postgresql://${user}:${password}@${host}:${port}/${database}`;

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  return pool;
}

/**
 * Initialize database schema for users table
 */


/**
 * Raw users row shape (Postgres snake_case columns)
 */
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * Map a raw row to the camelCase User shape. Without this, auth paths read
 * `passwordHash`/`createdAt` off the raw row and get undefined.
 */
function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Find user by email
 */
export async function findByEmail(email: string): Promise<User | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<UserRow>(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Find user by ID
 */
export async function findById(id: string): Promise<User | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Create a new user
 */
export async function create(
  email: string,
  passwordHash: string,
  name: string,
  role: UserRole = "user",
  status: UserStatus = "active"
): Promise<User> {
  const client = await getPool().connect();
  try {
    const result = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, name, role, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email.toLowerCase(), passwordHash, name, role, status]
    );
    return toUser(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * User query parameters for pagination and search
 */
export interface UserQueryParams {
  page: number;
  pageSize: number;
  emailSearch?: string;
  role?: UserRole;
  status?: UserStatus;
}

/**
 * User pagination result
 */
export interface UserPaginationResult {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get paginated users with optional search and filtering
 */
export async function getPaginatedUsers(
  params: UserQueryParams
): Promise<UserPaginationResult> {
  const { page, pageSize, emailSearch, role, status } = params;
  const client = await getPool().connect();

  try {
    // Build where clause
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (emailSearch) {
      whereClauses.push(`email ILIKE $${paramIndex++}`);
      values.push(`%${emailSearch}%`);
    }

    if (role) {
      whereClauses.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    if (status) {
      whereClauses.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    const whereClause = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const countResult = await client.query<{ count: string }>(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated users
    const offset = (page - 1) * pageSize;
    const usersQuery = `
      SELECT * FROM users ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const usersResult = await client.query<UserRow>(usersQuery, [...values, pageSize, offset]);

    return {
      users: usersResult.rows.map(toUser),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } finally {
    client.release();
  }
}

/**
 * Update user role
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole
): Promise<User | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<UserRow>(
      `UPDATE users
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newRole, userId]
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Close the database pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
