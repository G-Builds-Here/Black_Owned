/**
 * Scrape Job Repository
 *
 * PostgreSQL data access layer for scrape job operations.
 */

import { PoolClient } from "pg";
import { ScrapeJob, ScrapeJobStatus, CreateScrapeJobInput } from "../../types/scrape-job";
import { getPool } from "./user-repository";

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
      business_count INTEGER,
      error_message TEXT,
      started_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      CONSTRAINT scrape_jobs_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
    )
  `);

  // Idempotent upgrades for tables created before these columns/constraint existed
  await client.query(`
    ALTER TABLE ${getTableName()}
    ADD COLUMN IF NOT EXISTS error_message TEXT
  `);
  await client.query(`
    ALTER TABLE ${getTableName()}
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE
  `);
  await client.query(`
    ALTER TABLE ${getTableName()}
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE
  `);
  await client.query(`
    ALTER TABLE ${getTableName()}
    DROP CONSTRAINT IF EXISTS scrape_jobs_status_check
  `);
  await client.query(`
    ALTER TABLE ${getTableName()}
    ADD CONSTRAINT scrape_jobs_status_check
      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
  `);

  // Create index on status for filtering
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON ${getTableName()}(status)
  `);

  // Create index on created_at for sorting
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON ${getTableName()}(created_at DESC)
  `);

  // Create index on started_at for analytics (duration/duration-trend queries)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scrape_jobs_started_at ON ${getTableName()}(started_at DESC)
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
    businessCount: (r.business_count as number | null) ?? undefined,
    errorMessage: (r.error_message as string | null) ?? undefined,
    startedAt: r.started_at ? new Date(r.started_at as string) : undefined,
    completedAt: r.completed_at ? new Date(r.completed_at as string) : undefined,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

/**
 * Create a new scrape job
 */
export async function createScrapeJob(
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
}

/**
 * Delete a scrape job by ID, returning the deleted row (or undefined if absent)
 */
export async function deleteScrapeJob(
  client: PoolClient,
  id: string
): Promise<ScrapeJob | undefined> {
  const tableName = getTableName();
  const result = await client.query<ScrapeJob>(
    `DELETE FROM ${tableName} WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] ? rowToScrapeJob(result.rows[0]) : undefined;
}

/**
 * Update scrape job status. Terminal states (completed, failed, cancelled)
 * are final: any update to a job already in a terminal state is a no-op and
 * this function returns undefined, so a cancelled job can never be
 * resurrected by a late completion or failure write.
 */
export async function updateScrapeJobStatus(
  client: PoolClient,
  id: string,
  status: ScrapeJobStatus,
  resultCount?: number,
  errorMessage?: string
): Promise<ScrapeJob | undefined> {
  const tableName = getTableName();

  // Lifecycle timestamps are computed here: started_at on the first transition
  // to running, completed_at on any terminal transition. The status parameter
  // must be used only in the assignment — comparing it against literals in
  // CASE expressions makes the server deduce two different types for the same
  // parameter and reject the statement (42P08). COALESCE keeps the previous
  // count when no count is supplied, which also satisfies live tables where
  // business_count is NOT NULL.
  const now = new Date();
  const isTerminal =
    status === "completed" || status === "failed" || status === "cancelled";
  const result = await client.query<ScrapeJob>(
    `UPDATE ${tableName}
     SET status = $2,
         business_count = COALESCE($3, business_count),
         error_message = $4,
         started_at = COALESCE(started_at, $5),
         completed_at = $6,
         updated_at = NOW()
     WHERE id = $1
       AND status NOT IN ('completed', 'failed', 'cancelled')
     RETURNING *`,
    [
      id,
      status,
      resultCount ?? null,
      errorMessage ?? null,
      status === "running" ? now : null,
      isTerminal ? now : null,
    ]
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
}

/**
 * Cancel a running scrape job by ID. Manages its own connection (unlike the
 * caller-supplied client functions above) so route handlers can invoke it with
 * just the job id. Returns the cancelled job, or null if the job is missing or
 * not in a cancellable (running) state.
 */
export async function cancelScrapeJob(id: string): Promise<ScrapeJob | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query<ScrapeJob>(
      `UPDATE ${getTableName()}
       SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'running'
       RETURNING *`,
      [id]
    );
    return result.rows[0] ? rowToScrapeJob(result.rows[0]) : null;
  } finally {
    client.release();
  }
}
