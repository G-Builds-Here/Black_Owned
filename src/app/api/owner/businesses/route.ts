/**
 * Owner Businesses API Route
 *
 * GET /api/owner/businesses - list the authenticated user's businesses
 * (owner dashboard, LOC-0043).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";

// Built per request so specs can reconfigure the factory between tests.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requireAuth = createAuthMiddleware(["user", "business_owner", "admin"]);
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(
      authResult.errorType!,
      authResult.errorMessage!
    );
  }
  const userId = authResult.user!.userId;

  try {
    const schema = process.env.POSTGRES_SCHEMA;
    const businessTable = schema ? `${schema}.businesses` : "businesses";
    const categoryTable = schema ? `${schema}.categories` : "categories";

    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT b.id, b.name, b.description, COALESCE(c.name, b.category_id) AS category,
                b.verification_status AS status, b.created_at AS "createdAt"
         FROM ${businessTable} b
         LEFT JOIN ${categoryTable} c ON c.id::text = b.category_id
         WHERE b.owner_id = $1
         ORDER BY b.created_at DESC`,
        [userId]
      );

      return NextResponse.json({
        success: true,
        data: { businesses: result.rows },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching owner businesses:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
