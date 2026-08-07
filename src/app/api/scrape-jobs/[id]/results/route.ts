/**
 * Scrape Job Results API Route
 *
 * GET /api/scrape-jobs/:id/results - Get scraped businesses for a completed job
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  findScrapeJobById,
  updateScrapeJobStatus,
} from "@/lib/db/scrape-job-repository";
import { findBusinessesByJobId } from "@/lib/db/pending-import-business-repository";
import { ScrapeJobStatus } from "@/types/scrape-job";

/**
 * Validates UUID format
 */
function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * GET /api/scrape-jobs/:id/results
 * Get scraped businesses for a specific scrape job
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

    // Check if job exists
    const client = await getPool().connect();
    try {
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

      // Only return results for completed jobs
      if (job.status !== "completed") {
        return NextResponse.json(
          {
            success: false,
            error: "Job is not completed",
            code: "NOT_COMPLETED",
            status: job.status,
          },
          { status: 400 }
        );
      }

      // Fetch businesses for this job
      const businesses = await findBusinessesByJobId(client, id);

      return NextResponse.json({
        success: true,
        data: {
          jobId: id,
          status: job.status,
          businessCount: businesses.length,
          businesses: businesses,
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
