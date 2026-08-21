/**
 * Scrape Job Results API Route
 *
 * GET /api/scrape-jobs/[id]/results - Get scraped businesses for a job
 */

import { NextRequest, NextResponse } from "next/server";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import {
  findScrapedBusinessesByJobId,
} from "@/lib/db/scraped-business-repository";
import { getPool } from "@/lib/db/user-repository";
import { ScrapeJobStatus } from "@/types/scrape-job";

/**
 * GET /api/scrape-jobs/[id]/results
 * Get all scraped businesses for a specific scrape job
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    // Validate UUID format
    if (!isValidUuid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid job ID format",
          code: "INVALID_ID",
        },
        { status: 400 }
      );
    }

    // Get database connection
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Initialize schema if needed

      // Check if scrape job exists
      const job = await findScrapeJobById(client, id);

      if (!job) {
        return NextResponse.json(
          {
            success: false,
            error: "Scrape job not found",
            code: "NOT_FOUND",
          },
          { status: 404 }
        );
      }

      // Check if job is completed
      if (job.status !== "completed") {
        return NextResponse.json(
          {
            success: false,
            error: "Job is not completed yet",
            code: "JOB_NOT_COMPLETED",
            status: job.status,
          },
          { status: 400 }
        );
      }

      // Fetch scraped businesses for this job
      const businesses = await findScrapedBusinessesByJobId(client, id);

      return NextResponse.json({
        success: true,
        data: {
          jobId: id,
          businessCount: businesses.length,
          businesses,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching scrape job results:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * Validate UUID format
 */
function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
