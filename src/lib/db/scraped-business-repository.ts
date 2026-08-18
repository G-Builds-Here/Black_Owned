/**
 * Scraped Business Repository
 *
 * PostgreSQL data access layer for storing scraped business data.
 */

import { PoolClient } from "pg";
import { ScraperSource } from "../../types/scraper-result";

/**
 * Input for creating a new scraped business record
 */
export interface CreateScrapedBusinessInput {
  scrapeJobId: string;
  source: ScraperSource;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  sourceId?: string;
}

/**
 * Scraped business entity
 */
export interface ScrapedBusiness {
  id: string;
  scrapeJobId: string;
  source: ScraperSource;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  sourceId?: string;
  createdAt: Date;
}

/**
 * Get the scraped_businesses table name
 */
function getTableName(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.scraped_businesses` : "scraped_businesses";
}

/**
 * Initialize the scraped_businesses table schema
 */
export async function initializeScrapedBusinessSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${getTableName()} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scrape_job_id UUID NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
      source VARCHAR(20) NOT NULL,
      name VARCHAR(500) NOT NULL,
      address TEXT,
      phone VARCHAR(50),
      website VARCHAR(500),
      category VARCHAR(255),
      rating DECIMAL(3,2),
      review_count INTEGER,
      source_id VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // Create index on scrape_job_id for fast lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scraped_businesses_job_id ON ${getTableName()}(scrape_job_id)
  `);

  // Create index on source for filtering
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scraped_businesses_source ON ${getTableName()}(source)
  `);

  // Create composite index on job_id + source for common queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scraped_businesses_job_source ON ${getTableName()}(scrape_job_id, source)
  `);
}

/**
 * Convert database row to ScrapedBusiness entity
 */
function rowToScrapedBusiness(row: unknown): ScrapedBusiness {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    scrapeJobId: r.scrape_job_id as string,
    source: r.source as ScraperSource,
    name: r.name as string,
    address: (r.address as string) ?? "",
    phone: (r.phone as string) ?? undefined,
    website: (r.website as string) ?? undefined,
    category: (r.category as string) ?? undefined,
    rating: (r.rating as number | null) ?? undefined,
    reviewCount: (r.review_count as number | null) ?? undefined,
    sourceId: (r.source_id as string) ?? undefined,
    createdAt: new Date(r.created_at as string),
  };
}

/**
 * Create a new scraped business record
 */
export async function createScrapedBusiness(
  client: PoolClient,
  input: CreateScrapedBusinessInput
): Promise<ScrapedBusiness> {
  const tableName = getTableName();
  const result = await client.query<ScrapedBusiness>(
    `INSERT INTO ${tableName}
     (scrape_job_id, source, name, address, phone, website, category, rating, review_count, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.scrapeJobId,
      input.source,
      input.name,
      input.address,
      input.phone ?? null,
      input.website ?? null,
      input.category ?? null,
      input.rating ?? null,
      input.reviewCount ?? null,
      input.sourceId ?? null,
    ]
  );
  return rowToScrapedBusiness(result.rows[0]);
}

/**
 * Find all scraped businesses by job ID
 */
export async function findScrapedBusinessesByJobId(
  client: PoolClient,
  jobId: string
): Promise<ScrapedBusiness[]> {
  const tableName = getTableName();
  const result = await client.query<ScrapedBusiness>(
    `SELECT * FROM ${tableName} WHERE scrape_job_id = $1 ORDER BY created_at DESC`,
    [jobId]
  );
  return result.rows.map(rowToScrapedBusiness);
}

/**
 * Find the most recent scraped businesses for display
 * (e.g. the homepage "Featured Businesses" section).
 * Returns the latest `limit` businesses by created_at, newest first.
 */
export async function findFeaturedScrapedBusinesses(
  client: PoolClient,
  limit = 10
): Promise<ScrapedBusiness[]> {
  const tableName = getTableName();
  const result = await client.query<ScrapedBusiness>(
    `SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map(rowToScrapedBusiness);
}

/**
 * Find a scraped business by ID
 */
export async function findScrapedBusinessById(
  client: PoolClient,
  id: string
): Promise<ScrapedBusiness | undefined> {
  const tableName = getTableName();
  const result = await client.query<ScrapedBusiness>(
    `SELECT * FROM ${tableName} WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToScrapedBusiness(result.rows[0]) : undefined;
}

/**
 * Count businesses by job ID
 */
export async function countBusinessesByJobId(
  client: PoolClient,
  jobId: string
): Promise<number> {
  const tableName = getTableName();
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM ${tableName} WHERE scrape_job_id = $1`,
    [jobId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Delete all businesses for a job (used in cleanup)
 */
export async function deleteBusinessesByJobId(
  client: PoolClient,
  jobId: string
): Promise<void> {
  const tableName = getTableName();
  await client.query(
    `DELETE FROM ${tableName} WHERE scrape_job_id = $1`,
    [jobId]
  );
}
