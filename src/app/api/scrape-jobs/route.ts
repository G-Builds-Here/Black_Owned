/**
 * Scrape Jobs API Route
 *
 * REST endpoints for scrape job management.
 */

import { NextRequest, NextResponse } from "next/server";
import { createScrapeJob, getScrapeJobSummary } from "@/lib/db/scrape-job-repository";
import { CreateScrapeJobInput } from "@/types/scrape-job";

/**
 * GET /api/scrape-jobs/summary
 * Get scrape job summary statistics
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse days parameter (default: 30)
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10) || 30;

    const summary = await getScrapeJobSummary(days);

    return NextResponse.json(
      {
        success: true,
        data: {
          total_jobs: summary.total_jobs,
          successful_jobs: summary.successful_jobs,
          failed_jobs: summary.failed_jobs,
          pending_jobs: summary.pending_jobs,
          running_jobs: summary.running_jobs,
          period: {
            days: days,
            total_jobs: summary.last_30_days.total_jobs,
            successful_jobs: summary.last_30_days.successful_jobs,
            failed_jobs: summary.last_30_days.failed_jobs,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Scrape job summary error:", error);

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
 * POST /api/scrape-jobs
 * Create a new scrape job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { source, query, location } = body;

    // Validate required fields
    if (!source || !query || !location) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: source, query, location",
          errors: [
            !source && { field: "source", message: "Source is required" },
            !query && { field: "query", message: "Query is required" },
            !location && { field: "location", message: "Location is required" },
          ].filter(Boolean),

        },
        { status: 400 }
      );
    }

    // Validate source
    const validSources = ["google-maps", "yelp", "facebook"];
    if (!validSources.includes(source)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid source",
          errors: [
            {
              field: "source",
              message: `Source must be one of: ${validSources.join(", ")}`,
            },
          ],

        },
        { status: 400 }
      );
    }

    const input: CreateScrapeJobInput = {
      source,
      query,
      location,
    };

    const result = await createScrapeJob(input);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: result.id,
          source: result.source,
          query: result.query,
          location: result.location,
          status: result.status,
          created_at: result.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Scrape job creation error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
