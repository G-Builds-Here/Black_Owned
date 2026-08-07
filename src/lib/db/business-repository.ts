/**
 * Business Repository
 *
 * PostgreSQL data access layer for business operations.
 */

import { PoolClient } from "pg";
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
      phone VARCHAR(50),
      website VARCHAR(255),
      potential_duplicate_id UUID,
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
    phone: r.phone as string | undefined,
    website: r.website as string | undefined,
    potentialDuplicateId: r.potential_duplicate_id as string | undefined,
  };
}

/**
 * Create a new business
 */
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
}

/**
 * Normalize phone number to exact match format.
 * Removes all non-digit characters and strips leading country code "1" for US numbers.
 * Returns a canonical 10-digit representation.
 * Examples:
 *   "(555) 123-4567" -> "5551234567"
 *   "555-123-4567" -> "5551234567"
 *   "+1-555-123-4567" -> "5551234567"
 *   "1-555-123-4567" -> "5551234567"
 */
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.trim().replace(/\D/g, "");
  // Strip leading "1" for 11-digit US numbers
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Create a new business with phone number, website, and duplicate detection
 */
export async function createBusinessWithPhone(
  client: PoolClient,
  ownerId: string,
  name: string,
  description: string | undefined,
  categoryId: string,
  phone: string | undefined,
  website: string | undefined,
  potentialDuplicateId: string | undefined
): Promise<Business> {
  const tableName = getTableName();
  const normalizedPhone = phone ? normalizePhoneNumber(phone) : undefined;
  const result = await client.query<Business>(
    `INSERT INTO ${tableName} (owner_id, name, description, category_id, verification_status, phone, website, potential_duplicate_id)
     VALUES ($1, $2, $3, $4, 'unverified', $5, $6, $7)
     RETURNING *`,
    [ownerId, name, description || null, categoryId, normalizedPhone || null, website || null, potentialDuplicateId || null]
  );
  return rowToBusiness(result.rows[0]);
}

/**
 * Update business with duplicate detection result
 */
export async function updateBusinessWithDuplicateInfo(
  client: PoolClient,
  businessId: string,
  phone: string,
  website: string | undefined,
  potentialDuplicateId: string | undefined
): Promise<Business> {
  const tableName = getTableName();
  const normalizedPhone = normalizePhoneNumber(phone);
  const result = await client.query<Business>(
    `UPDATE ${tableName}
     SET phone = $1, website = $2, potential_duplicate_id = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [normalizedPhone, website || null, potentialDuplicateId || null, businessId]
  );
  return rowToBusiness(result.rows[0]);
}
