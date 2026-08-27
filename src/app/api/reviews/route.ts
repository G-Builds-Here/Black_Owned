/**
 * Review Creation API Route
 *
 * POST /api/reviews - submits a public review for a business.
 * Auth: any authenticated user (user | business_owner | admin).
 *
 * Body:
 *   businessId (uuid, required) - the business being reviewed
 *   rating     (int 1-5, required)
 *   comment    (string, required, 1-2000 chars)
 *   locationId (uuid, optional) - the specific location being reviewed;
 *                                 must belong to the business
 *
 * New reviews are visible immediately (visible = TRUE); admins can
 * soft-hide them later via POST /api/reviews/[id]/moderate.
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

const MAX_COMMENT_LENGTH = 2000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requireAuth = createAuthMiddleware(["user", "business_owner", "admin"]);
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  const userId = authResult.user!.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const businessId = typeof input.businessId === "string" ? input.businessId : "";
  if (!isValidUuid(businessId)) {
    return NextResponse.json(
      { success: false, error: "businessId must be a valid UUID", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const rating = typeof input.rating === "number" ? Math.trunc(input.rating) : null;
  if (rating === null || rating < 1 || rating > 5 || Number.isNaN(rating)) {
    return NextResponse.json(
      { success: false, error: "rating must be an integer between 1 and 5", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (comment.length === 0 || comment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: `comment must be between 1 and ${MAX_COMMENT_LENGTH} characters`,
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  let locationId: string | null = null;
  if (input.locationId != null && input.locationId !== "") {
    if (typeof input.locationId !== "string" || !isValidUuid(input.locationId)) {
      return NextResponse.json(
        { success: false, error: "locationId must be a valid UUID", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    locationId = input.locationId;
  }

  try {
    const client = await getPool().connect();
    try {
      const biz = await client.query(
        `SELECT id FROM businesses WHERE id = $1`,
        [businessId]
      );
      if (biz.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "Business not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      if (locationId) {
        const loc = await client.query(
          `SELECT id FROM business_locations WHERE id = $1 AND business_id = $2`,
          [locationId, businessId]
        );
        if (loc.rows.length === 0) {
          return NextResponse.json(
            {
              success: false,
              error: "Location does not belong to this business",
              code: "VALIDATION_ERROR",
            },
            { status: 400 }
          );
        }
      }

      const result = await client.query(
        `INSERT INTO reviews (business_id, user_id, rating, comment, location_id, visible)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, rating, comment, visible, created_at`,
        [businessId, userId, rating, comment, locationId]
      );

      return NextResponse.json(
        {
          success: true,
          data: {
            id: result.rows[0].id,
            rating: result.rows[0].rating,
            comment: result.rows[0].comment,
            visible: result.rows[0].visible,
            createdAt: result.rows[0].created_at,
          },
        },
        { status: 201 }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error creating review:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
