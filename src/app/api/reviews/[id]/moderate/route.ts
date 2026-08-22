/**
 * Review Moderation API Route
 *
 * POST /api/reviews/[id]/moderate - Admin soft-hides or restores a review
 * (LOC-0037 AC4: the specced moderateReview mutation, served as a REST
 * endpoint because the app's admin surface runs on auth-gated REST routes)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * POST /api/reviews/[id]/moderate
 * Body: { action: "approve" | "hide" }
 * approve -> visible = true (review appears in public queries)
 * hide    -> visible = false (excluded publicly, row preserved)
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
          error: "Invalid review ID format",
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
    const action =
      body && typeof body === "object" && "action" in body
        ? (body as { action?: unknown }).action
        : undefined;

    if (action !== "approve" && action !== "hide") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid moderation action. Must be approve or hide.",
          code: "INVALID_ACTION",
        },
        { status: 400 }
      );
    }

    const visible = action === "approve";

    const client = await getPool().connect();
    try {
      const result = await client.query(
        `UPDATE reviews
         SET visible = $2
         WHERE id = $1
         RETURNING id, visible`,
        [id, visible]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Review not found",
            code: "NOT_FOUND",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          id: result.rows[0].id,
          visible: result.rows[0].visible,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error moderating review:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
