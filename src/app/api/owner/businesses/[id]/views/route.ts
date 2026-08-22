/**
 * Owner Business Views API Route
 *
 * GET /api/owner/businesses/[id]/views?days=30 - daily view counts for one
 * of the authenticated user's businesses (owner dashboard chart, LOC-0043).
 * Days are clamped to 1..90; missing days are filled with 0.
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid business ID format", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const schema = process.env.POSTGRES_SCHEMA;
    const businessTable = schema ? `${schema}.businesses` : "businesses";

    const daysRaw = parseInt(new URL(request.url).searchParams.get("days") ?? "30", 10);
    const days = Number.isNaN(daysRaw) ? 30 : Math.min(Math.max(daysRaw, 1), 90);

    const client = await getPool().connect();
    try {
      const ownership = await client.query(
        `SELECT owner_id FROM ${businessTable} WHERE id = $1`,
        [id]
      );
      if (ownership.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "Business not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      if (ownership.rows[0].owner_id !== userId) {
        return NextResponse.json(
          { success: false, error: "Not your business", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      // Window starts at 00:00 UTC `days-1` days ago, so the series always
      // spans whole days and ends today.
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - (days - 1));

      const result = await client.query(
        `SELECT date_trunc('day', viewed_at) AS day, COUNT(*)::int AS views
         FROM business_views
         WHERE business_id = $1 AND viewed_at >= $2
         GROUP BY 1
         ORDER BY 1`,
        [id, start]
      );

      const byDay = new Map(
        (result.rows as { day: Date | string; views: number }[]).map((row) => [
          new Date(row.day).toISOString().slice(0, 10),
          row.views,
        ])
      );

      const series: { date: string; views: number }[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        const key = d.toISOString().slice(0, 10);
        series.push({ date: key, views: byDay.get(key) ?? 0 });
      }

      return NextResponse.json({
        success: true,
        data: { businessId: id, days: series },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching business views:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
