/**
 * Scrape Jobs API Route
 *
 * POST /api/jobs - Create a new scrape job
 * GET /api/jobs - List all scrape jobs with pagination
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createScrapeJob,
  findAllScrapeJobs,
  initializeScrapeJobSchema,
} from "@/lib/db/scrape-job-repository";
import {
  validateScrapeJobInput,
  CreateScrapeJobInput,
} from "@/types/scrape-job";

/**
 * GET /api/jobs
 * List all scrape jobs with pagination
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await initializeScrapeJobSchema();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") || undefined;

    // Validate pagination params
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pagination parameters. Page must be >= 1, pageSize must be 1-100.",
        },
        { status: 400 }
      );
    }

    const result = await findAllScrapeJobs(page, pageSize, status);

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

/**
 * POST /api/jobs
 * Create a new scrape job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await initializeScrapeJobSchema();

    const body: CreateScrapeJobInput = await request.json();

    // Validate input
    const validation = validateScrapeJobInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    // Create the job
    const job = await createScrapeJob(body);

    return NextResponse.json({
      success: true,
      data: job,
      message: "Scrape job created successfully",
    });
  } catch (error) {
    console.error("Error creating scrape job:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
