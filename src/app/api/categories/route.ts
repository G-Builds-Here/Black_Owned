/**
 * Categories API Route
 *
 * GET /api/categories - the real category options (id + display name) used by
 * the claim wizard and any category selects (LOC-0043).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const schema = process.env.POSTGRES_SCHEMA;
    const categoryTable = schema ? `${schema}.categories` : "categories";

    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT id, name FROM ${categoryTable} ORDER BY name`
      );
      return NextResponse.json({
        success: true,
        data: { categories: result.rows },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
