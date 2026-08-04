/**
 * Scrape Job Management API Route
 *
 * GET /api/scrape-jobs/[id] - Get a specific scrape job
 * DELETE /api/scrape-jobs/[id] - Delete a scrape job
 */

import { NextRequest, NextResponse } from "next/server";
import {
  findScrapeJobById,
  deleteScrapeJob,
} from "@/lib/db/scrape-job-repository";
import { requireAuth, AuthenticatedUser } from "@/lib/auth/auth-middleware";

/**
 * GET /api/scrape-jobs/[id]
 * Get a specific scrape job by ID
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

    const job = await findScrapeJobById(id);

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

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Error fetching scrape job:", error);
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
 * DELETE /api/scrape-jobs/[id]
 * Delete a scrape job by ID (admin only)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return requireAuth(async (req, res) => {
    // Only admins can delete scrape jobs
    if (req.user.role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Only administrators can delete scrape jobs",
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 }
      );
    }

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
      const existingJob = await findScrapeJobById(id);
      if (!existingJob) {
        return NextResponse.json(
          {
            success: false,
            error: "Scrape job not found",
            code: "NOT_FOUND",
          },
          { status: 404 }
        );
      }

      // Delete the job
      const deleted = await deleteScrapeJob(id);

      if (!deleted) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to delete scrape job",
            code: "DELETE_FAILED",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Scrape job deleted successfully",
        data: { id },
      });
    } catch (error) {
      console.error("Error deleting scrape job:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      );
    }
  })(request, NextResponse);
}

/**
 * Validate UUID format
 */
function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
