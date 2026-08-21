/**
 * Business Reject API Route
 *
 * POST /api/businesses/[id]/reject - Reject a pending business
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";

/**
 * Validate UUID format
 */
function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

const REASON_MAX_LENGTH = 500;

/**
 * POST /api/businesses/[id]/reject
 * Reject a pending business by updating its status to "rejected"
 * and persisting the rejection reason.
 *
 * Body: { reason: string } — required, non-empty after trim, max 500 chars
 */
export async function POST(
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

      // Parse the rejection reason (required, non-empty, bounded)
      let reason: unknown;
      try {
        const body: unknown = await request.json();
        reason =
          body && typeof body === "object"
            ? (body as Record<string, unknown>).reason
            : undefined;
      } catch {
        reason = undefined;
      }

      const trimmedReason =
        typeof reason === "string" ? reason.trim() : "";

      if (trimmedReason.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Rejection reason is required",
            code: "REASON_REQUIRED",
          },
          { status: 400 }
        );
      }

      if (trimmedReason.length > REASON_MAX_LENGTH) {
        return NextResponse.json(
          {
            success: false,
            error: `Rejection reason must be ${REASON_MAX_LENGTH} characters or fewer`,
            code: "REASON_TOO_LONG",
          },
          { status: 400 }
        );
      }

      // Update status to rejected and persist the reason
      const result = await client.query(
        `UPDATE pending_import_businesses
         SET status = 'rejected', rejection_reason = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, trimmedReason]
      );

      return NextResponse.json({
        success: true,
        message: "Business rejected successfully",
        data: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          status: result.rows[0].status,
          rejection_reason: trimmedReason,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error rejecting business:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
