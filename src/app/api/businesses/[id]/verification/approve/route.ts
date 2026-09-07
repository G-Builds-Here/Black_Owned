/**
 * Verification Approve API Route
 *
 * POST /api/businesses/[id]/verification/approve - Admin marks a business
 * verified and publishes the verification.approved NATS event (LOC-0039 AC2)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import { publishVerificationApproved } from "@/lib/nats/client";

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * POST /api/businesses/[id]/verification/approve
 * Sets verification_status to "verified" and publishes
 * verification.approved with the business ID on NATS.
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

    const client = await getPool().connect();
    try {
      const existing = await client.query(
        "SELECT id, verification_status FROM businesses WHERE id = $1",
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

      if (existing.rows[0].verification_status === "verified") {
        return NextResponse.json(
          {
            success: false,
            error: "Business is already verified",
            code: "ALREADY_VERIFIED",
          },
          { status: 409 }
        );
      }

      // Publish before the state change so a NATS outage leaves the
      // business unverified and the call can be retried cleanly.
      await publishVerificationApproved(id);

      await client.query(
        "UPDATE businesses SET verification_status = 'verified' WHERE id = $1",
        [id]
      );

      return NextResponse.json({
        success: true,
        data: {
          id,
          verificationStatus: "verified",
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error approving verification:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
