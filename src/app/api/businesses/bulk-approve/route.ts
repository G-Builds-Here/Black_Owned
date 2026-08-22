/**
 * Bulk Approve API Route
 *
 * POST /api/businesses/bulk-approve - Approve multiple pending businesses at once
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
 * POST /api/businesses/bulk-approve
 * Approve multiple pending businesses by updating their status to "approved"
 *
 * Request body:
 * {
 *   businessIds: string[] - Array of business UUIDs to approve
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  try {
    const body = await request.json();
    const { businessIds } = body;

    // Validate request body
    if (!Array.isArray(businessIds) || businessIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "businessIds must be a non-empty array",
          code: "INVALID_REQUEST",
        },
        { status: 400 }
      );
    }

    // Validate all UUIDs
    const invalidIds = businessIds.filter((id: string) => !isValidUuid(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid business ID format",
          invalidIds,
          code: "INVALID_ID",
        },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      // Begin transaction for atomic operation
      await client.query("BEGIN");

      try {
        // Check which businesses exist and are in pending_review status
        const placeholders = businessIds.map((_: unknown, i: number) => `$${i + 1}`).join(", ");
        const existingResult = await client.query(
          `SELECT id, name, status FROM pending_import_businesses WHERE id IN (${placeholders})`,
          businessIds
        );

        const existingBusinesses = existingResult.rows;
        const notFoundIds = businessIds.filter(
          (id: string) => !existingBusinesses.some((b: { id: string }) => b.id === id)
        );

        if (notFoundIds.length > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              success: false,
              error: "Some businesses not found",
              notFoundIds,
              code: "NOT_FOUND",
            },
            { status: 404 }
          );
        }

        // Check for businesses not in pending_review status
        const invalidStatusBusinesses = existingBusinesses.filter(
          (b: { status: string }) => b.status !== "pending_review"
        );

        if (invalidStatusBusinesses.length > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              success: false,
              error: "Some businesses are not in pending_review status",
              invalidStatusBusinesses: invalidStatusBusinesses.map((b: { id: string; status: string }) => ({
                id: b.id,
                currentStatus: b.status,
              })),
              code: "INVALID_STATUS",
            },
            { status: 400 }
          );
        }

        // Update all businesses to approved status
        const updateResult = await client.query(
          `UPDATE pending_import_businesses
           SET status = 'approved', updated_at = NOW()
           WHERE id IN (${placeholders})
           RETURNING id, name, status`,
          businessIds
        );

        // Commit transaction
        await client.query("COMMIT");

        return NextResponse.json({
          success: true,
          message: `${updateResult.rows.length} businesses approved successfully`,
          data: {
            approvedCount: updateResult.rows.length,
            approvedBusinesses: updateResult.rows.map((row: { id: string; name: string; status: string }) => ({
              id: row.id,
              name: row.name,
              status: row.status,
            })),
          },
        });
      } catch (error) {
        // Rollback on error
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error in bulk approve:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
