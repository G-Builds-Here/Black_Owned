/**
 * Scrape Job Status API Route
 *
 * GET /api/scrape-jobs/:id/status - Get the status of a specific scrape job
 */

import { NextRequest, NextResponse } from "next/server";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";

/**
 * GET /api/scrape-jobs/:id/status
 * Get the status of a specific scrape job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = params;

    // Validate ID
    if (!id || id.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Job ID is required",
        },
        { status: 400 }
      );
    }

    // Fetch the scrape job
    const job = await findScrapeJobById(id);

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: "Scrape job not found",
        },
        { status: 404 }
      );
    }

    // Return job status
    return NextResponse.json(
      {
        success: true,
        data: {
          id: job.id,
          status: job.status,
          source: job.source,
          query: job.query,
          location: job.location,
          business_count: job.business_count,
          created_at: job.created_at,
          updated_at: job.updated_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Scrape job status error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
