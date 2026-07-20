/**
 * Business Repository
 *
 * PostgreSQL data access layer for business operations.
 */

import { PoolClient } from "pg";
import { getPool } from "./user-repository";

/**
 * Business record stored in PostgreSQL
 */
export interface Business {
  id: string;
  name: string;
  owner_id: string;
  category_id: string;
  verified: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Initialize business table schema
 */
export async function initializeBusinessSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        owner_id UUID NOT NULL REFERENCES users(id),
        category_id VARCHAR(100),
        verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on owner_id for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id)
    `);
  } finally {
    client.release();
  }
}

/**
 * Find business by ID
 */
export async function findById(id: string): Promise<Business | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<Business>(
      "SELECT * FROM businesses WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Find businesses owned by a user
 */
export async function findByOwnerId(ownerId: string): Promise<Business[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query<Business>(
      "SELECT * FROM businesses WHERE owner_id = $1",
      [ownerId]
    );
    return result.rows;
  } finally {
    client.release();
  }
=======
import { Business } from "../../types/business";

/**
 * Get business table name (with schema if configured)
 */
function getTableName(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.businesses` : "businesses";
}

/**
 * Initialize the businesses table schema
 */
export async function initializeBusinessSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${getTableName()} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category_id VARCHAR(100) NOT NULL,
      verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Convert database row to Business entity
 */
function rowToBusiness(row: unknown): Business {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    categoryId: r.category_id as string,
    verificationStatus: r.verification_status as "unverified" | "pending" | "verified",
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
>>>>>>> feature/LOC-0037-AC1
}

/**
 * Create a new business
 */
<<<<<<< HEAD
export async function create(
  name: string,
  ownerId: string,
  categoryId?: string
): Promise<Business> {
  const client = await getPool().connect();
  try {
    const result = await client.query<Business>(
      `INSERT INTO businesses (name, owner_id, category_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, ownerId, categoryId || null]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Update business name (only if user is owner)
 * Returns null if business not found or user is not owner
 */
export async function updateNameById(
  id: string,
  name: string,
  ownerId: string
): Promise<Business | null> {
  const client = await getPool().connect();
  try {
    // Verify ownership first
    const ownershipCheck = await client.query<Business>(
      "SELECT id FROM businesses WHERE id = $1 AND owner_id = $2",
      [id, ownerId]
    );

    if (ownershipCheck.rows.length === 0) {
      return null; // Business not found or user is not owner
    }

    // Update the business
    const result = await client.query<Business>(
      `UPDATE businesses
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_id = $3
       RETURNING *`,
      [name, id, ownerId]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
=======
export async function createBusiness(
  client: PoolClient,
  ownerId: string,
  name: string,
  description: string | undefined,
  categoryId: string
): Promise<Business> {
  const tableName = getTableName();
  const result = await client.query<Business>(
    `INSERT INTO ${tableName} (owner_id, name, description, category_id, verification_status)
     VALUES ($1, $2, $3, $4, 'unverified')
     RETURNING *`,
    [ownerId, name, description || null, categoryId]
  );
  return rowToBusiness(result.rows[0]);
}

/**
 * Find a business by ID
 */
export async function findBusinessById(
  client: PoolClient,
  id: string
): Promise<Business | undefined> {
  const tableName = getTableName();
  const result = await client.query<Business>(
    `SELECT * FROM ${tableName} WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToBusiness(result.rows[0]) : undefined;
}

/**
 * Find all businesses owned by a user
 */
export async function findBusinessesByOwnerId(
  client: PoolClient,
  ownerId: string
): Promise<Business[]> {
  const tableName = getTableName();
  const result = await client.query<Business>(
    `SELECT * FROM ${tableName} WHERE owner_id = $1 ORDER BY created_at DESC`,
    [ownerId]
  );
  return result.rows.map(rowToBusiness);
>>>>>>> feature/LOC-0037-AC1
}
