/**
 * User Repository
 *
 * PostgreSQL data access layer for user operations.
 */

import { Pool, PoolClient } from "pg";
import { User } from "../../types/user";

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
export async function initializeUserSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on email for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);
  } finally {
    client.release();
  }
}

/**
 * Find user by email
 */
export async function findByEmail(email: string): Promise<User | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<User>(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
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
    const result = await client.query<User>(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
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
  name: string
): Promise<User> {
  const client = await getPool().connect();
  try {
    const result = await client.query<User>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email.toLowerCase(), passwordHash, name]
    );
    return result.rows[0];
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
