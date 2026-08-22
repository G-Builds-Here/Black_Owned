/**
 * Business Approve API Route
 *
 * POST /api/businesses/[id]/approve - Approve a pending business
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";

/**
 * Validate UUID format
 */
function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * POST /api/businesses/[id]/approve
 * Approve a pending business by updating its status to "approved"
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  try {
    const { id } = await context.params;

    // Validate UUID format
    if (!isValidUuid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid business ID format",
          code: "INVALID_ID",
        },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      // Check if business exists and is in pending_review status
      const existingResult = await client.query(
        "SELECT id, name, status FROM pending_import_businesses WHERE id = $1",
        [id]
      );

      if (existingResult.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Business not found",
            code: "NOT_FOUND",
          },
          { status: 404 }
        );
      }

      const business = existingResult.rows[0];

      if (business.status !== "pending_review") {
        return NextResponse.json(
          {
            success: false,
            error: `Business is not in pending_review status (current status: ${business.status})`,
            code: "INVALID_STATUS",
          },
          { status: 400 }
        );
      }

      // Update status to approved
      const result = await client.query(
        `UPDATE pending_import_businesses
         SET status = 'approved', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      return NextResponse.json({
        success: true,
        data: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          status: result.rows[0].status,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error approving business:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
