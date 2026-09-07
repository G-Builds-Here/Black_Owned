/**
 * Business View API Route
 *
 * POST /api/businesses/[id]/view - record a public view of a business
 * detail page. Powers the owner dashboard's 30-day views chart.
 * Public: visitors are not required to be signed in.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    if (!isValidUuid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid business ID format", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      const existing = await client.query("SELECT id FROM businesses WHERE id = $1", [id]);
      if (existing.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "Business not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      await client.query("INSERT INTO business_views (business_id) VALUES ($1)", [id]);
      return NextResponse.json({ success: true }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error recording business view:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
