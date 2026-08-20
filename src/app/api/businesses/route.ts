/**
 * Businesses API Route
 *
 * GET /api/businesses - List businesses with filtering and search
 *   - search: Search by name (case-insensitive)
 *   - status: Filter by status (pending/approved/rejected)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20, max: 100)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findBusinessesWithFilter, BusinessFilter } from "@/lib/db/business-repository";

/**
 * GET /api/businesses
 * List businesses with filtering and pagination
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pagination parameters. Page must be >= 1, limit must be 1-100.",
        },
        { status: 400 }
      );
    }

    // Validate status if provided
    const validStatuses = ["pending", "approved", "rejected"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Build filter object
    const filter: BusinessFilter = {
      search,
      page,
      limit,
    };

    if (status) {
      filter.status = status as "pending" | "approved" | "rejected";
    }

    // Get database connection
    const pool = getPool();
    const client = await pool.connect();

    try {
      const result = await findBusinessesWithFilter(client, filter);

      return NextResponse.json({
        success: true,
        data: {
          businesses: result.data,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching businesses:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
