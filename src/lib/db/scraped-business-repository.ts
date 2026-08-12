/**
 * Scraped Business Repository
 *
 * PostgreSQL data access layer for scraped business operations.
 */

import { PoolClient } from "pg";
import { CreateScrapedBusinessInput, ScrapedBusiness } from "../../types/scraped-business";
import { ScraperSource } from "../../types/scraper-result";

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
      scrape_job_id UUID NOT NULL,
      source VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      address TEXT NOT NULL,
      phone VARCHAR(50),
      website VARCHAR(255),
      category VARCHAR(100),
      rating DECIMAL(3,2),
      review_count INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_scrape_job FOREIGN KEY (scrape_job_id) REFERENCES scrape_jobs(id) ON DELETE CASCADE
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
    address: r.address as string,
    phone: (r.phone as string | null) ?? undefined,
    website: (r.website as string | null) ?? undefined,
    category: (r.category as string | null) ?? undefined,
    rating: (r.rating as number | null) ?? undefined,
    reviewCount: (r.review_count as number | null) ?? undefined,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
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
    `INSERT INTO ${tableName} (scrape_job_id, source, name, address, phone, website, category, rating, review_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    ]
  );
  return rowToScrapedBusiness(result.rows[0]);
}

/**
 * Find all scraped businesses for a given scrape job
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
