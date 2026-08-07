/**
 * Scrape Job Repository
 *
 * PostgreSQL data access layer for scrape job operations.
 */

import { PoolClient } from "pg";
import {
  CreateScrapeJobInput,
  CreateScrapeJobResult,
  ScrapeJob,
  ScraperSource,
  ScrapeJobStatus,
  ExtractedBusinessMetadata,
} from "../../types/scrape-job";
import { getPool } from "./user-repository";

/**
 * Initialize scrape jobs table schema
 */
export async function initializeScrapeJobSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scrape_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source VARCHAR(50) NOT NULL,
        query TEXT NOT NULL,
        location TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        business_count INTEGER NOT NULL DEFAULT 0,
        extracted_metadata JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on status for filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status)
    `);

    // Create index on created_at for sorting
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON scrape_jobs(created_at DESC)
    `);
  } finally {
    client.release();
  }
}

/**
 * Create a new scrape job
 */
export async function createScrapeJob(
  input: CreateScrapeJobInput
): Promise<CreateScrapeJobResult> {
  const client = await getPool().connect();
  try {
    const result = await client.query<CreateScrapeJobResult>(
      `INSERT INTO scrape_jobs (source, query, location, status, business_count, extracted_metadata, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', 0, '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, source, query, location, status, created_at`,
      [input.source, input.query, input.location]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Convert database row to ScrapeJob entity
 */
function rowToScrapeJob(row: unknown): ScrapeJob {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    source: r.source as ScraperSource,
    query: r.query as string,
    location: r.location as string,
    status: r.status as ScrapeJobStatus,
    business_count: (r.business_count as number) ?? 0,
    extracted_metadata: (r.extracted_metadata as ExtractedBusinessMetadata[]) ?? [],
    created_at: new Date(r.created_at as string),
    updated_at: new Date(r.updated_at as string),
  };
}

/**
 * Get scrape job by ID
 */
export async function findScrapeJobById(id: string): Promise<ScrapeJob | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<ScrapeJob>(
      `SELECT id, source, query, location, status, business_count, extracted_metadata, created_at, updated_at
       FROM scrape_jobs
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? rowToScrapeJob(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Get all scrape jobs with pagination
 */
export async function findAllScrapeJobs(
  page: number = 1,
  pageSize: number = 20,
  status?: ScrapeJobStatus
): Promise<{ jobs: ScrapeJob[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const offset = (page - 1) * pageSize;
  const client = await getPool().connect();
  try {
    let countQuery = "SELECT COUNT(*) FROM scrape_jobs";
    let mainQuery = `
      SELECT id, source, query, location, status, business_count, extracted_metadata, created_at, updated_at
      FROM scrape_jobs
    `;
    const countParams: unknown[] = [];
    const mainParams: unknown[] = [];

    if (status) {
      countQuery += " WHERE status = $1";
      mainQuery += " WHERE status = $1";
      countParams.push(status);
      mainParams.push(status);
    }

    // Get total count
    const countResult = await client.query<{ count: string }>(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    mainQuery += ` ORDER BY created_at DESC LIMIT $${mainParams.length + 1} OFFSET $${mainParams.length + 2}`;
    mainParams.push(pageSize, offset);

    const result = await client.query<ScrapeJob>(mainQuery, mainParams);

    const totalPages = Math.ceil(total / pageSize);

    return {
      jobs: result.rows.map(rowToScrapeJob),
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
 * Update scrape job status
 */
export async function updateScrapeJobStatus(
  id: string,
  status: ScrapeJobStatus
): Promise<ScrapeJob | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<ScrapeJob>(
      `UPDATE scrape_jobs
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, source, query, location, status, business_count, extracted_metadata, created_at, updated_at`,
      [status, id]
    );
    return result.rows[0] ? rowToScrapeJob(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Update scrape job business count
 */
export async function updateScrapeJobBusinessCount(
  id: string,
  businessCount: number
): Promise<ScrapeJob | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<ScrapeJob>(
      `UPDATE scrape_jobs
       SET business_count = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, source, query, location, status, business_count, extracted_metadata, created_at, updated_at`,
      [businessCount, id]
    );
    return result.rows[0] ? rowToScrapeJob(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Save extracted business metadata to a scrape job
 */
export async function saveExtractedMetadata(
  id: string,
  metadata: ExtractedBusinessMetadata[]
): Promise<ScrapeJob | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<ScrapeJob>(
      `UPDATE scrape_jobs
       SET extracted_metadata = $1, business_count = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, source, query, location, status, business_count, extracted_metadata, created_at, updated_at`,
      [JSON.stringify(metadata), metadata.length, id]
    );
    return result.rows[0] ? rowToScrapeJob(result.rows[0]) : null;
  } finally {
    client.release();
  }
}
