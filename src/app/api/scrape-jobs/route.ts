/**
 * Scrape Jobs API Route
 *
 * REST endpoints for scrape job management.
 */

import { NextRequest, NextResponse } from "next/server";
import { createScrapeJob, getScrapeJobSummary, findAllScrapeJobs } from "@/lib/db/scrape-job-repository";
import { CreateScrapeJobInput, ScrapeJobStatus, ScraperSource } from "@/types/scrape-job";

/**
 * GET /api/scrape-jobs
 * List scrape jobs with pagination and filtering
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Parse pagination parameters
    const page = parseInt(searchParams.get("page") || "1", 10) || 1;
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10) || 20;

    // Parse filter parameters
    const statusParam = searchParams.get("status");
    const sourceParam = searchParams.get("source");
    const businessIdParam = searchParams.get("businessId");

    // Validate status if provided
    if (statusParam) {
      const validStatuses = ["pending", "running", "completed", "failed", "cancelled"];
      if (!validStatuses.includes(statusParam)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid status parameter",
            details: `Status must be one of: ${validStatuses.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    // Validate source if provided
    if (sourceParam) {
      const validSources = ["google-maps", "yelp", "facebook"];
      if (!validSources.includes(sourceParam)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid source parameter",
            details: `Source must be one of: ${validSources.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    // Validate page and pageSize
    if (page < 1) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid page parameter",
          details: "Page must be greater than or equal to 1",
        },
        { status: 400 }
      );
    }

    if (pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pageSize parameter",
          details: "PageSize must be between 1 and 100",
        },
        { status: 400 }
      );
    }

    // Call repository with filters
    const status = statusParam as ScrapeJobStatus | undefined;
    const result = await findAllScrapeJobs(page, pageSize, status);

    // Transform dates to ISO strings for JSON response
    const jobs = result.jobs.map((job) => ({
      id: job.id,
      source: job.source,
      query: job.query,
      location: job.location,
      status: job.status,
      business_count: job.business_count,
      created_at: job.created_at.toISOString(),
      updated_at: job.updated_at.toISOString(),
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          jobs,
          pagination: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Scrape job list error:", error);
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
 * GET /api/scrape-jobs/summary
 * Get scrape job summary statistics
 */
export async function GETSummary(request: NextRequest): Promise<NextResponse> {
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
