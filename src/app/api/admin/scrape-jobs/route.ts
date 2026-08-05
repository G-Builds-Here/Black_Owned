/**
 * Scrape Jobs API Route
 *
 * GET /api/admin/scrape-jobs - Returns jobs as JSON array
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllJobs } from "@/lib/db/job-repository";

/**
 * GET /api/admin/scrape-jobs
 * Returns all jobs as a JSON array
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const jobs = await getAllJobs();

    return NextResponse.json(jobs, { status: 200 });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
