/**
 * Business Export API Route
 *
 * GET /api/businesses/export - Export businesses as CSV
 *   - status: Filter by status (pending/approved/rejected)
 *   - source: Filter by source (google-maps/yelp/facebook)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findBusinessesWithFilter, BusinessFilter } from "@/lib/db/business-repository";

/**
 * Convert a business record to CSV row
 */
function businessToCSVRow(business: Record<string, unknown>): string {
  const fields = [
    business.id as string,
    business.name as string,
    business.description as string | "",
    business.category_id as string,
    business.verification_status as string,
    business.import_source as string | "",
    business.scrape_job_id as string | "",
    business.owner_id as string,
    business.created_at as string,
    business.updated_at as string,
  ];

  // Escape fields that contain commas, quotes, or newlines
  return fields
    .map((field) => {
      const str = String(field);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(",");
}

/**
 * Convert database result to CSV string
 */
function resultToCSV(result: { data: Record<string, unknown>[]; total: number }): string {
  const headers = [
    "ID",
    "Name",
    "Description",
    "Category ID",
    "Status",
    "Import Source",
    "Scrape Job ID",
    "Owner ID",
    "Created At",
    "Updated At",
  ];

  const rows = result.data.map(businessToCSVRow);

  return [headers.join(","), ...rows].join("\n");
}

/**
 * GET /api/businesses/export
 * Export businesses as CSV with filtering and pagination
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const source = searchParams.get("source") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "1000", 10);

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 10000) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pagination parameters. Page must be >= 1, limit must be 1-10000.",
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

    // Validate source if provided
    const validSources = ["google-maps", "yelp", "facebook"];
    if (source && !validSources.includes(source)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid source: ${source}. Must be one of: ${validSources.join(", ")}`,
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

    if (source) {
      filter.source = source as "google-maps" | "yelp" | "facebook";
    }

    // Get database connection
    const pool = getPool();
    const client = await pool.connect();

    try {
      const result = await findBusinessesWithFilter(client, filter);
      const csvContent = resultToCSV(result);

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `businesses-${status || "all"}-${timestamp}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error exporting businesses:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
