/**
 * Business Repository
 *
 * PostgreSQL data access layer for business operations.
 */

import { PoolClient } from "pg";
import { Business, BusinessLocation } from "../../types/business";
import { PLATFORMS, Platform, SocialUrls } from "../../services/social-discovery";

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
 * Normalize the stored `social_urls` JSONB into the `SocialUrls` display
 * shape (a record keyed by platform). Two producers write the column:
 * enrichment and the admin content editor store an array of
 * `{platform, url}` entries; older rows may carry the keyed object shape
 * directly. Both read back as the record the detail page and GraphQL
 * resolver expect.
 */
function normalizeSocialUrls(raw: unknown): SocialUrls | null {
  if (raw == null) {
    return null;
  }
  if (!Array.isArray(raw)) {
    return raw as SocialUrls;
  }
  const out: SocialUrls = {};
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const platform = typeof e.platform === "string" ? e.platform.toLowerCase() : "";
    const url = typeof e.url === "string" ? e.url : "";
    if (!PLATFORMS.includes(platform as Platform) || !url) {
      continue;
    }
    if (!out[platform as Platform]) {
      out[platform as Platform] = {
        url,
        handle: extractSocialHandle(url),
        confidence: 0.75,
        verified: false,
        source: "google_search",
      };
    }
  }
  return out;
}

/**
 * Extract the social handle (last path segment) from a profile URL.
 */
function extractSocialHandle(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
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
    socialUrls: normalizeSocialUrls(r.social_urls),
    phone: (r.phone as string | null | undefined) ?? null,
    menuUrl: (r.menu_url as string | null | undefined) ?? null,
    ratingSource: (r.rating_source as string | null | undefined) ?? 'google',
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
 * Aggregate on-site reviews for a business (visible reviews only).
 * Kept separate from the scraped rating/review_count aggregate so the
 * detail page can show "reviews on this site" and "X reviews on Google"
 * as distinct numbers.
 */
export async function findSiteReviewStats(
  client: PoolClient,
  businessId: string
): Promise<{ count: number; average: number | null }> {
  const result = await client.query<{ count: string; average: number | null }>(
    `SELECT count(*)::text AS count, avg(rating)::float8 AS average
     FROM reviews
     WHERE business_id = $1 AND visible = TRUE`,
    [businessId]
  );
  const row = result.rows[0];
  if (!row) return { count: 0, average: null };
  return {
    count: Number(row.count),
    average: row.average != null ? Number(row.average) : null,
  };
}

export interface SiteReviewRow {
  id: string;
  rating: number;
  comment: string;
  reviewerName: string;
  locationLabel: string | null;
  createdAt: Date;
}

/**
 * Visible reviews for a business, newest first, with the reviewer's name
 * and (when the review targeted a specific branch) the location label.
 */
export async function findSiteReviews(
  client: PoolClient,
  businessId: string
): Promise<SiteReviewRow[]> {
  const result = await client.query<{
    id: string;
    rating: number;
    comment: string;
    reviewer_name: string;
    location_label: string | null;
    created_at: Date;
  }>(
    `SELECT r.id, r.rating, r.comment,
            u.name AS reviewer_name,
            l.label AS location_label,
            r.created_at
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN business_locations l ON l.id = r.location_id
     WHERE r.business_id = $1 AND r.visible = TRUE
     ORDER BY r.created_at DESC`,
    [businessId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment,
    reviewerName: row.reviewer_name,
    locationLabel: row.location_label,
    createdAt: row.created_at,
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
