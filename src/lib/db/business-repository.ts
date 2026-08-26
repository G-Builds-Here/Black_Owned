/**
 * Business Repository
 *
 * PostgreSQL data access layer for business operations.
 */

import { PoolClient } from "pg";
import { Business, BusinessLocation } from "../../types/business";
import { SocialUrls } from "../../services/social-discovery";

/**
 * Get business table name (with schema if configured)
 */
function getTableName(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.businesses` : "businesses";
}

/**
 * Get business_locations table name (with schema if configured)
 */
function getLocationsTableName(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.business_locations` : "business_locations";
}

/**
 * Initialize the businesses table schema
 */


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
    location: (r.location as string | null | undefined) ?? null,
    rating: r.rating != null ? Number(r.rating) : null,
    reviewCount: r.review_count != null ? Number(r.review_count) : null,
    website: (r.website as string | null | undefined) ?? null,
    imageUrl: (r.image_url as string | null | undefined) ?? null,
    lat: (r.lat as number | null | undefined) ?? null,
    lng: (r.lng as number | null | undefined) ?? null,
    tags: (r.tags as string[] | null | undefined) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
    socialUrls: r.social_urls as SocialUrls | null | undefined,
  };
}
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
 * Filter options for finding businesses
 */
export interface BusinessFilter {
  search?: string;
  status?: "pending" | "approved" | "rejected" | "unverified" | "verified";
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
 * Find businesses with optional search/status filter and pagination
 */
export async function findBusinessesWithFilter(
  client: PoolClient,
  filter: BusinessFilter
): Promise<PaginatedResult<Business>> {
  const tableName = getTableName();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filter.search) {
    conditions.push(`name ILIKE $${paramIndex}`);
    params.push(`%${filter.search}%`);
    paramIndex++;
  }

  if (filter.status) {
    conditions.push(`verification_status = $${paramIndex}`);
    params.push(filter.status);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM ${tableName} ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (filter.page - 1) * filter.limit;
  const result = await client.query<Business>(
    `SELECT * FROM ${tableName} ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, filter.limit, offset]
  );

  return {
    data: result.rows.map(rowToBusiness),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
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
  if (!result.rows[0]) return undefined;
  const business = rowToBusiness(result.rows[0]);
  business.locations = await findBusinessLocations(client, id);
  return business;
}

/**
 * Find all physical locations for a business.
 * Primary location first, then any secondary locations.
 */
export async function findBusinessLocations(
  client: PoolClient,
  businessId: string
): Promise<BusinessLocation[]> {
  const tableName = getLocationsTableName();
  const result = await client.query<{
    id: string;
    label: string | null;
    address: string;
    lat: number | null;
    lng: number | null;
    is_primary: boolean;
  }>(
    `SELECT id, label, address, lat, lng, is_primary
     FROM ${tableName}
     WHERE business_id = $1
     ORDER BY is_primary DESC, created_at ASC`,
    [businessId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    isPrimary: row.is_primary,
  }));
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
 * Update business name by ID (owner verification)
 */
export async function updateNameById(
  client: PoolClient,
  id: string,
  name: string,
  ownerId: string
): Promise<Business | undefined> {
  const tableName = getTableName();
  const result = await client.query<Business>(
    `UPDATE ${tableName} SET name = $1, updated_at = NOW() WHERE id = $2 AND owner_id = $3 RETURNING *`,
    [name, id, ownerId]
  );
  return result.rows[0] ? rowToBusiness(result.rows[0]) : undefined;
}

/**
 * Update business description by ID (owner verification).
 * `description: null` clears the description.
 */
export async function updateDescriptionById(
  client: PoolClient,
  id: string,
  description: string | null,
  ownerId: string
): Promise<Business | undefined> {
  const tableName = getTableName();
  const result = await client.query<Business>(
    `UPDATE ${tableName} SET description = $1, updated_at = NOW() WHERE id = $2 AND owner_id = $3 RETURNING *`,
    [description, id, ownerId]
  );
  return result.rows[0] ? rowToBusiness(result.rows[0]) : undefined;
}

/**
 * Find all business names (dedup candidate pool for the import route).
 * The live businesses table carries no address/phone columns, so name only.
 */
export async function findBusinessNames(client: PoolClient): Promise<string[]> {
  const tableName = getTableName();
  const result = await client.query<{ name: string }>(
    `SELECT name FROM ${tableName}`
  );
  return result.rows.map((r) => r.name);
}
