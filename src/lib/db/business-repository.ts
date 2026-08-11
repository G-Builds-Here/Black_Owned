/**
 * Business Repository
 *
 * PostgreSQL data access layer for business operations.
 */

import { PoolClient } from "pg";
import { Business, VerificationStatus } from "../../types/business";
import { ImportSource } from "../../types/scraper-result";

/**
 * Filter options for finding businesses
 */
export interface BusinessFilter {
  search?: string;
  status?: "pending" | "approved" | "rejected";
  source?: "google-maps" | "yelp" | "facebook";
  page: number;
  limit: number;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Get the businesses table name
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
      category_id VARCHAR(50) NOT NULL,
      verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
      import_source VARCHAR(50),
      scrape_job_id UUID,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // Create indexes for common queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON ${getTableName()}(owner_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_businesses_verification_status ON ${getTableName()}(verification_status)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_businesses_import_source ON ${getTableName()}(import_source)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_businesses_scrape_job_id ON ${getTableName()}(scrape_job_id)
  `);
}

/**
 * Convert a database row to a Business entity
 */
function rowToBusiness(row: unknown): Business {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? undefined,
    categoryId: r.category_id as string,
    verificationStatus: r.verification_status as VerificationStatus,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

/**
 * Create a new business record
 */
export async function createBusiness(
  client: PoolClient,
  ownerId: string,
  name: string,
  description: string | undefined,
  categoryId: string,
  importSource?: ImportSource,
  scrapeJobId?: string
): Promise<Business> {
  const tableName = getTableName();
  const result = await client.query<Business>(
    `INSERT INTO ${tableName} (owner_id, name, description, category_id, verification_status, import_source, scrape_job_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [ownerId, name, description || null, categoryId, "unverified", importSource || null, scrapeJobId || null]
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
 * Find all businesses by owner ID
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
 * Find businesses with filtering and pagination
 */
export async function findBusinessesWithFilter(
  client: PoolClient,
  filter: BusinessFilter
): Promise<PaginatedResult<Business>> {
  const tableName = getTableName();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Build search condition
  if (filter.search) {
    conditions.push(`(name ILIKE $${paramIndex} OR address ILIKE $${paramIndex})`);
    params.push(`%${filter.search}%`);
    paramIndex++;
  }

  // Build status condition
  if (filter.status) {
    conditions.push(`verification_status = $${paramIndex}`);
    params.push(filter.status);
    paramIndex++;
  }

  // Build source condition
  if (filter.source) {
    conditions.push(`import_source = $${paramIndex}`);
    params.push(filter.source);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM ${tableName} ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Calculate offset
  const offset = (filter.page - 1) * filter.limit;

  // Get paginated results
  const result = await client.query<Business>(
    `SELECT * FROM ${tableName} ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, filter.limit, offset]
  );

  const totalPages = Math.ceil(total / filter.limit);

  return {
    data: result.rows.map(rowToBusiness),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages,
  };
}

/**
 * Update business verification status
 */
export async function updateBusinessStatus(
  client: PoolClient,
  id: string,
  status: VerificationStatus
): Promise<Business | undefined> {
  const tableName = getTableName();
  const result = await client.query<Business>(
    `UPDATE ${tableName}
     SET verification_status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  return result.rows[0] ? rowToBusiness(result.rows[0]) : undefined;
}

/**
 * Delete a business by ID
 */
export async function deleteBusiness(client: PoolClient, id: string): Promise<boolean> {
  const tableName = getTableName();
  const result = await client.query(
    `DELETE FROM ${tableName} WHERE id = $1`,
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
