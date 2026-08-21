/**
 * Scrape Jobs API Route
 *
 * POST /api/scrape-jobs - Create a new scrape job
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createScrapeJob,
} from "@/lib/db/scrape-job-repository";
import { validateScrapeJobInput } from "@/types/scrape-job";

/**
 * GET /api/scrape-jobs
 * List scrape jobs (optional: filter by status)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    // Get database pool
    const { getPool } = await import("@/lib/db/user-repository");
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Initialize schema on first request

      const { findScrapeJobs } = await import("@/lib/db/scrape-job-repository");
      const jobs = await findScrapeJobs(client, status as "pending" | "running" | "completed" | "failed" | undefined);

      return NextResponse.json({
        success: true,
        data: jobs,
      });
    } finally {
      client.release();
    }
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
          error: "Missing required fields: source, query, and location are all required",
        },
        { status: 400 }
      );
    }

    const input = { source, query, location };

    // Validate input
    const validation = validateScrapeJobInput(input);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.errors.join(", "),
        },
        { status: 400 }
      );
    }

    // Get database pool
    const { getPool } = await import("@/lib/db/user-repository");
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Initialize schema on first request

      // Create the scrape job
      const job = await createScrapeJob(client, input);

      return NextResponse.json(
        {
          success: true,
          data: job,
          message: "Scrape job created successfully",
        },
        { status: 201 }
      );
    } finally {
      client.release();
    }
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
