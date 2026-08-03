/**
 * Scrape Job Repository
 *
 * PostgreSQL data access layer for scrape job operations.
 */

import { PoolClient } from "pg";
<<<<<<< HEAD
import { ScrapeJob, ScrapeJobStatus, CreateScrapeJobInput } from "../../types/scrape-job";

/**
 * Get the scrape_jobs table name
 */
function getTableName(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.scrape_jobs` : "scrape_jobs";
}

/**
 * Initialize the scrape_jobs table schema
 */
export async function initializeScrapeJobSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${getTableName()} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source VARCHAR(255) NOT NULL,
      query TEXT NOT NULL,
      location VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      result_count INTEGER,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // Create index on status for filtering
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON ${getTableName()}(status)
  `);

  // Create index on created_at for sorting
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON ${getTableName()}(created_at DESC)
  `);
}

/**
 * Convert database row to ScrapeJob entity
 */
function rowToScrapeJob(row: unknown): ScrapeJob {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    source: r.source as string,
    query: r.query as string,
    location: r.location as string,
    status: r.status as ScrapeJobStatus,
    resultCount: (r.result_count as number | null) ?? undefined,
    errorMessage: (r.error_message as string | null) ?? undefined,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
=======
import {
  CreateScrapeJobInput,
  CreateScrapeJobResult,
  ScrapeJob,
  ScraperSource,
  ScrapeJobStatus,
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
>>>>>>> feature/LOC-0059-AC1
}

/**
 * Create a new scrape job
 */
export async function createScrapeJob(
<<<<<<< HEAD
  client: PoolClient,
  input: CreateScrapeJobInput
): Promise<ScrapeJob> {
  const tableName = getTableName();
  const result = await client.query<ScrapeJob>(
    `INSERT INTO ${tableName} (source, query, location, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING *`,
    [input.source, input.query, input.location]
  );
  return rowToScrapeJob(result.rows[0]);
}

/**
 * Find a scrape job by ID
 */
export async function findScrapeJobById(
  client: PoolClient,
  id: string
): Promise<ScrapeJob | undefined> {
  const tableName = getTableName();
  const result = await client.query<ScrapeJob>(
    `SELECT * FROM ${tableName} WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToScrapeJob(result.rows[0]) : undefined;
=======
  input: CreateScrapeJobInput
): Promise<CreateScrapeJobResult> {
  const client = await getPool().connect();
  try {
    const result = await client.query<CreateScrapeJobResult>(
      `INSERT INTO scrape_jobs (source, query, location, status, business_count, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, source, query, location, status, created_at`,
      [input.source, input.query, input.location]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Get scrape job by ID
 */
export async function findScrapeJobById(id: string): Promise<ScrapeJob | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<ScrapeJob>(
      `SELECT id, source, query, location, status, business_count, created_at, updated_at
       FROM scrape_jobs
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
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
      SELECT id, source, query, location, status, business_count, created_at, updated_at
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
      jobs: result.rows,
      total,
      page,
      pageSize,
      totalPages,
    };
  } finally {
    client.release();
  }
>>>>>>> feature/LOC-0059-AC1
}

/**
 * Update scrape job status
 */
export async function updateScrapeJobStatus(
<<<<<<< HEAD
  client: PoolClient,
  id: string,
  status: ScrapeJobStatus,
  resultCount?: number,
  errorMessage?: string
): Promise<ScrapeJob | undefined> {
  const tableName = getTableName();

  const result = await client.query<ScrapeJob>(
    `UPDATE ${tableName}
     SET status = $2,
         result_count = $3,
         error_message = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, resultCount ?? null, errorMessage ?? null]
  );
  return result.rows[0] ? rowToScrapeJob(result.rows[0]) : undefined;
}

/**
 * Find all scrape jobs with optional status filter
 */
export async function findScrapeJobs(
  client: PoolClient,
  status?: ScrapeJobStatus,
  limit?: number
): Promise<ScrapeJob[]> {
  const tableName = getTableName();

  if (status) {
    const whereClause = limit
      ? `WHERE status = $1 ORDER BY created_at DESC LIMIT $2`
      : `WHERE status = $1 ORDER BY created_at DESC`;
    const params = limit ? [status, limit] : [status];

    const result = await client.query<ScrapeJob>(
      `SELECT * FROM ${tableName} ${whereClause}`,
      params
    );
    return result.rows.map(rowToScrapeJob);
  }

  const result = await client.query<ScrapeJob>(
    `SELECT * FROM ${tableName} ORDER BY created_at DESC${limit ? ' LIMIT $1' : ''}`,
    limit ? [limit] : []
  );
  return result.rows.map(rowToScrapeJob);
=======
  id: string,
  status: ScrapeJobStatus
): Promise<ScrapeJob | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<ScrapeJob>(
      `UPDATE scrape_jobs
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, source, query, location, status, business_count, created_at, updated_at`,
      [status, id]
    );
    return result.rows[0] || null;
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
       RETURNING id, source, query, location, status, business_count, created_at, updated_at`,
      [businessCount, id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Scrape job summary statistics for the analytics page
 */
export interface ScrapeJobSummary {
  total_jobs: number;
  successful_jobs: number;
  failed_jobs: number;
  pending_jobs: number;
  running_jobs: number;
  last_30_days: {
    total_jobs: number;
    successful_jobs: number;
    failed_jobs: number;
  };
}

/**
 * Get scrape job summary statistics
 * @param days - Number of days to look back (default: 30)
 */
export async function getScrapeJobSummary(days: number = 30): Promise<ScrapeJobSummary> {
  const client = await getPool().connect();
  try {
    // Get overall summary
    const overallQuery = `
      SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_jobs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
        COUNT(*) FILTER (WHERE status = 'running') as running_jobs
      FROM scrape_jobs
    `;
    const overallResult = await client.query<ScrapeJobSummary>(overallQuery);
    const overall = overallResult.rows[0];

    // Get last N days summary
    const lastDaysQuery = `
      SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_jobs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
      FROM scrape_jobs
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
    `;
    const lastDaysResult = await client.query<ScrapeJobSummary>(lastDaysQuery);
    const lastDays = lastDaysResult.rows[0];

    return {
      total_jobs: overall.total_jobs || 0,
      successful_jobs: overall.successful_jobs || 0,
      failed_jobs: overall.failed_jobs || 0,
      pending_jobs: overall.pending_jobs || 0,
      running_jobs: overall.running_jobs || 0,
      last_30_days: {
        total_jobs: lastDays.total_jobs || 0,
        successful_jobs: lastDays.successful_jobs || 0,
        failed_jobs: lastDays.failed_jobs || 0,
      },
    };
  } finally {
    client.release();
  }
>>>>>>> feature/LOC-0059-AC1
}
