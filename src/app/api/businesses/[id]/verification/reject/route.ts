/**
 * Verification Reject API Route
 *
 * POST /api/businesses/[id]/verification/reject - Admin rejects a
 * verification request with a required reason and publishes the
 * verification.rejected NATS event (LOC-0039 AC3)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import { publishVerificationRejected } from "@/lib/nats/client";

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * POST /api/businesses/[id]/verification/reject
 * Body: { reason: string } (required)
 * Sets verification_status to "rejected" (verified stays false) and
 * publishes verification.rejected with the business ID and reason.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const reason =
      body && typeof body === "object" && "reason" in body
        ? (body as { reason?: unknown }).reason
        : undefined;

    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Rejection reason is required",
          code: "VALIDATION",
        },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      const existing = await client.query(
        "SELECT id FROM businesses WHERE id = $1",
        [id]
      );

      if (existing.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Business not found",
            code: "NOT_FOUND",
          },
          { status: 404 }
        );
      }

      // Publish before the state change so a NATS outage leaves the
      // verification status untouched and the call can be retried.
      await publishVerificationRejected(id, reason.trim());

      await client.query(
        "UPDATE businesses SET verification_status = 'rejected' WHERE id = $1",
        [id]
      );

      return NextResponse.json({
        success: true,
        data: {
          id,
          verificationStatus: "rejected",
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error rejecting verification:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
