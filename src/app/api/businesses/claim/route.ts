/**
 * Claim Business API Route
 *
 * POST /api/businesses/claim - authenticated owner claims a business by
 * creating it as `unverified` under their account (claim wizard, LOC-0043).
 * The category must be a real category from the categories table.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requireAuth = createAuthMiddleware(["user", "business_owner", "admin"]);
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(
      authResult.errorType!,
      authResult.errorMessage!
    );
  }
  const userId = authResult.user!.userId;

  let body: {
    name?: unknown;
    description?: unknown;
    categoryId?: unknown;
    location?: unknown;
    website?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0) {
    return NextResponse.json(
      { success: false, error: "Business name is required", code: "INVALID_NAME" },
      { status: 400 }
    );
  }
  if (name.length > 255) {
    return NextResponse.json(
      { success: false, error: "Business name must be 255 characters or fewer", code: "INVALID_NAME" },
      { status: 400 }
    );
  }

  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;
  if (description && description.length > 2000) {
    return NextResponse.json(
      { success: false, error: "Description must be 2000 characters or fewer", code: "INVALID_DESCRIPTION" },
      { status: 400 }
    );
  }

  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  if (categoryId.length === 0) {
    return NextResponse.json(
      { success: false, error: "A category is required", code: "INVALID_CATEGORY" },
      { status: 400 }
    );
  }
  if (!isValidUuid(categoryId)) {
    return NextResponse.json(
      { success: false, error: "Unknown category", code: "INVALID_CATEGORY" },
      { status: 400 }
    );
  }

  const location =
    typeof body.location === "string" && body.location.trim().length > 0
      ? body.location.trim()
      : null;
  if (location && location.length > 255) {
    return NextResponse.json(
      { success: false, error: "Location must be 255 characters or fewer", code: "INVALID_LOCATION" },
      { status: 400 }
    );
  }

  const website =
    typeof body.website === "string" && body.website.trim().length > 0
      ? body.website.trim()
      : null;
  if (website && website.length > 500) {
    return NextResponse.json(
      { success: false, error: "Website must be 500 characters or fewer", code: "INVALID_WEBSITE" },
      { status: 400 }
    );
  }

  try {
    const schema = process.env.POSTGRES_SCHEMA;
    const businessTable = schema ? `${schema}.businesses` : "businesses";
    const categoryTable = schema ? `${schema}.categories` : "categories";

    const client = await getPool().connect();
    try {
      const categoryCheck = await client.query(
        `SELECT id FROM ${categoryTable} WHERE id = $1`,
        [categoryId]
      );
      if (categoryCheck.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "Unknown category", code: "INVALID_CATEGORY" },
          { status: 400 }
        );
      }

      const result = await client.query(
        `INSERT INTO ${businessTable}
           (owner_id, name, description, category_id, location, website, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'unverified')
         RETURNING id, name, category_id, verification_status`,
        [userId, name, description, categoryId, location, website]
      );

      const row = result.rows[0];
      return NextResponse.json(
        {
          success: true,
          data: {
            business: {
              id: row.id,
              name: row.name,
              categoryId: row.category_id,
              status: row.verification_status,
            },
          },
        },
        { status: 201 }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error claiming business:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
