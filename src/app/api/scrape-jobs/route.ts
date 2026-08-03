/**
 * Scrape Jobs API Route
 *
 * GET /api/scrape-jobs - List all scrape jobs with pagination and filtering
 */

import { NextRequest, NextResponse } from "next/server";
import {
  findAllScrapeJobs,
  initializeScrapeJobSchema,
} from "@/lib/db/scrape-job-repository";
import { ScrapeJobStatus } from "@/types/scrape-job";

/**
 * GET /api/scrape-jobs
 * List all scrape jobs with pagination and optional filtering by status and source
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Initialize schema on first request
    await initializeScrapeJobSchema();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") as ScrapeJobStatus | null;
    const source = searchParams.get("source");

    // Validate pagination parameters
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pagination parameters. Page must be >= 1, pageSize must be 1-100.",
        },
        { status: 400 }
      );
    }

    // Validate status filter if provided
    if (status && !["pending", "running", "completed", "failed"].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid status. Must be one of: pending, running, completed, failed.",
        },
        { status: 400 }
      );
    }

    // Validate source filter if provided
    if (source && !["google-maps", "yelp", "facebook"].includes(source)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid source. Must be one of: google-maps, yelp, facebook.",
        },
        { status: 400 }
      );
    }

    const result = await findAllScrapeJobs(page, pageSize, status || undefined);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching scrape jobs:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
