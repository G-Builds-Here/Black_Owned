/**
 * Pending Import Business Repository
 *
 * Handles insertion of businesses into the pending_import_businesses table
 * with transaction support for batch operations and proper error handling.
 */

import { getPool } from "./user-repository";
import { ScraperResult, ScraperSource } from "../../types/scraper-result";

/**
 * Pending import business record
 */
export interface PendingImportBusiness {
  id: string;
  name: string;
  description: string | undefined;
  category_id: string;
  status: string;
  source_data: Record<string, unknown>;
  job_id: string | undefined;
  created_at: Date;
  updated_at: Date;
}

/**
 * Import result for a single business
 */
export interface ImportResult {
  success: boolean;
  businessId?: string;
  error?: string;
  source: ScraperSource;
  originalId: string;
}

/**
 * Batch import result with error tracking
 */
export interface BatchImportResult {
  total: number;
  succeeded: number;
  failed: number;
  results: ImportResult[];
  errors: Array<{ source: ScraperSource; originalId: string; error: string }>;
}

/**
 * Initialize the pending import businesses table schema
 */
export async function initializePendingImportSchema(client: any): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pending_import_businesses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category_id VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
      source_data JSONB,
      job_id UUID,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_pending_import_status ON pending_import_businesses(status);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_pending_import_name ON pending_import_businesses(name);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_pending_import_job_id ON pending_import_businesses(job_id);
  `);
}

/**
 * Insert a single pending import business
 *
 * @param client - Database client (PoolClient for transaction support)
 * @param businessData - The business data to insert
 * @returns The inserted business ID
 * @throws Error if insert fails
 */
export async function insertPendingBusiness(
  client: any,
  businessData: {
    name: string;
    description: string | undefined;
    category_id: string;
    source_data: Record<string, unknown>;
    job_id?: string;
  }
): Promise<string> {
  const result = await client.query(
    `INSERT INTO pending_import_businesses (name, description, category_id, status, source_data, job_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      businessData.name,
      businessData.description,
      businessData.category_id,
      "pending_review",
      businessData.source_data,
      businessData.job_id || null,
    ]
  );

  return result.rows[0].id;
}

/**
 * Batch import businesses with transaction support and error handling.
 *
 * All businesses are inserted in a single transaction. If any insert fails,
 * the entire transaction is rolled back and errors are logged with business details.
 *
 * @param client - Database client (PoolClient for transaction support)
 * @param businesses - Array of business data to import
 * @param jobId - Optional scrape job ID to associate with the imported businesses
 * @returns Batch import result with success/failure counts and error details
 */
export async function batchImportBusinesses(
  client: any,
  businesses: Array<{
    name: string;
    description: string | undefined;
    category_id: string;
    source_data: Record<string, unknown>;
    source: ScraperSource;
    originalId: string;
  }>,
  jobId?: string
): Promise<BatchImportResult> {
  const results: ImportResult[] = [];
  const errors: Array<{ source: ScraperSource; originalId: string; error: string }> = [];

  try {
    // Begin transaction
    await client.query("BEGIN");

    // Insert all businesses in the transaction
    for (const business of businesses) {
      try {
        const businessId = await insertPendingBusiness(client, {
          name: business.name,
          description: business.description,
          category_id: business.category_id,
          source_data: business.source_data,
          job_id: jobId,
        });

        results.push({
          success: true,
          businessId,
          source: business.source,
          originalId: business.originalId,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Log error with business details
        console.error(
          `[Import Error] Failed to insert business: name="${business.name}", ` +
            `source=${business.source}, originalId=${business.originalId}, error=${errorMessage}`
        );

        errors.push({
          source: business.source,
          originalId: business.originalId,
          error: errorMessage,
        });

        results.push({
          success: false,
          error: errorMessage,
          source: business.source,
          originalId: business.originalId,
        });
      }
    }

    // Commit transaction
    await client.query("COMMIT");

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      total: results.length,
      succeeded,
      failed,
      results,
      errors,
    };
  } catch (error) {
    // Rollback transaction on any error
    await client.query("ROLLBACK");

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log the transaction-level error
    console.error(
      `[Import Error] Transaction failed for batch import: ${errorMessage}. ` +
        `Rolling back ${businesses.length} records.`
    );

    // Mark all as failed
    const failedResults: ImportResult[] = businesses.map((b) => ({
      success: false,
      error: errorMessage,
      source: b.source,
      originalId: b.originalId,
    }));

    const transactionErrors: Array<{ source: ScraperSource; originalId: string; error: string }> =
      businesses.map((b) => ({
        source: b.source,
        originalId: b.originalId,
        error: errorMessage,
      }));

    return {
      total: businesses.length,
      succeeded: 0,
      failed: businesses.length,
      results: failedResults,
      errors: transactionErrors,
    };
  }
}

/**
 * Find pending import businesses by status
 */
export async function findPendingByStatus(
  client: any,
  status: string
): Promise<PendingImportBusiness[]> {
  const result = await client.query(
    "SELECT * FROM pending_import_businesses WHERE status = $1 ORDER BY created_at DESC",
    [status]
  );

  return result.rows;
}

/**
 * Get count of pending import businesses by status
 */
export async function countByStatus(client: any, status: string): Promise<number> {
  const result = await client.query(
    "SELECT COUNT(*) FROM pending_import_businesses WHERE status = $1",
    [status]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Find businesses by scrape job ID
 */
export async function findBusinessesByJobId(
  client: any,
  jobId: string
): Promise<PendingImportBusiness[]> {
  const result = await client.query(
    "SELECT * FROM pending_import_businesses WHERE job_id = $1 ORDER BY created_at DESC",
    [jobId]
  );

  return result.rows;
}

/**
 * Import normalized businesses with transaction support and count recording.
 *
 * This function handles already-normalized business data (as opposed to raw scraped data).
 * All businesses are inserted in a single transaction. If any insert fails,
 * the entire transaction is rolled back. The import count is optionally recorded
 * in the scrape_jobs table if a jobId is provided.
 *
 * @param client - Database client (PoolClient for transaction support)
 * @param businesses - Array of normalized business data to import
 * @param jobId - Optional scrape job ID to record the import count
 * @returns Batch import result with success/failure counts and error details
 */
export async function importNormalizedBusinesses(
  client: any,
  businesses: Array<{
    name: string;
    description: string | undefined;
    category_id: string;
    source_data: Record<string, unknown>;
    source: ScraperSource;
    originalId: string;
  }>,
  jobId?: string
): Promise<BatchImportResult> {
  const results: ImportResult[] = [];
  const errors: Array<{ source: ScraperSource; originalId: string; error: string }> = [];

  try {
    // Begin transaction
    await client.query("BEGIN");

    // Insert all businesses in the transaction
    for (const business of businesses) {
      try {
        const businessId = await insertPendingBusiness(client, {
          name: business.name,
          description: business.description,
          category_id: business.category_id,
          source_data: business.source_data,
          job_id: jobId,
        });

        results.push({
          success: true,
          businessId,
          source: business.source,
          originalId: business.originalId,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Log error with business details
        console.error(
          `[Import Error] Failed to insert business: name="${business.name}", ` +
            `source=${business.source}, originalId=${business.originalId}, error=${errorMessage}`
        );

        errors.push({
          source: business.source,
          originalId: business.originalId,
          error: errorMessage,
        });

        results.push({
          success: false,
          error: errorMessage,
          source: business.source,
          originalId: business.originalId,
        });
      }
    }

    // Commit transaction
    await client.query("COMMIT");

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Record the import count if jobId is provided
    if (jobId && succeeded > 0) {
      try {
        await client.query(
          `UPDATE scrape_jobs SET business_count = business_count + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [succeeded, jobId]
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[Import Warning] Failed to record import count for job ${jobId}: ${errorMessage}`
        );
        // Don't fail the import if count recording fails
      }
    }

    return {
      total: results.length,
      succeeded,
      failed,
      results,
      errors,
    };
  } catch (error) {
    // Rollback transaction on any error
    await client.query("ROLLBACK");

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log the transaction-level error
    console.error(
      `[Import Error] Transaction failed for normalized business import: ${errorMessage}. ` +
        `Rolling back ${businesses.length} records.`
    );

    // Mark all as failed
    const failedResults: ImportResult[] = businesses.map((b) => ({
      success: false,
      error: errorMessage,
      source: b.source,
      originalId: b.originalId,
    }));

    const transactionErrors: Array<{ source: ScraperSource; originalId: string; error: string }> =
      businesses.map((b) => ({
        source: b.source,
        originalId: b.originalId,
        error: errorMessage,
      }));

    return {
      total: businesses.length,
      succeeded: 0,
      failed: businesses.length,
      results: failedResults,
      errors: transactionErrors,
    };
  }
}
