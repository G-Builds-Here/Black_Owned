/**
 * Job Repository
 *
 * PostgreSQL data access layer for job operations.
 */

import { PoolClient } from "pg";
import { Job, JobStatus } from "../../types/job";

/**
 * Get job table name (with schema if configured)
 */
function getTableName(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.jobs` : "jobs";
}

/**
 * Initialize the jobs table schema
 */


/**
 * Convert database row to Job entity
 */
function rowToJob(row: unknown): Job {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    title: r.title as string,
    company: r.company as string,
    location: r.location as string,
    description: r.description as string | undefined,
    url: r.url as string,
    status: r.status as JobStatus,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
    scrapedAt: r.scraped_at ? new Date(r.scraped_at as string) : undefined,
  };
}

/**
 * Get all jobs
 */
export async function getAllJobs(): Promise<Job[]> {
  // In a real implementation, this would use a database connection pool
  // For now, return an empty array as placeholder
  // TODO: Integrate with actual database connection
  return [];
}

/**
 * Create a new job
 */
export async function createJob(
  client: PoolClient,
  title: string,
  company: string,
  location: string,
  description: string | undefined,
  url: string
): Promise<Job> {
  const tableName = getTableName();
  const result = await client.query<Job>(
    `INSERT INTO ${tableName} (title, company, location, description, url, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [title, company, location, description || null, url]
  );
  return rowToJob(result.rows[0]);
}

/**
 * Find a job by ID
 */
export async function findJobById(
  client: PoolClient,
  id: string
): Promise<Job | undefined> {
  const tableName = getTableName();
  const result = await client.query<Job>(
    `SELECT * FROM ${tableName} WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToJob(result.rows[0]) : undefined;
}

/**
 * Update job status
 */
export async function updateJobStatus(
  client: PoolClient,
  id: string,
  status: JobStatus,
  scrapedAt?: Date
): Promise<Job | undefined> {
  const tableName = getTableName();
  const scrapedAtParam = scrapedAt || new Date();

  const result = await client.query<Job>(
    `UPDATE ${tableName}
     SET status = $1, scraped_at = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, scrapedAtParam.toISOString(), id]
  );
  return result.rows[0] ? rowToJob(result.rows[0]) : undefined;
}
