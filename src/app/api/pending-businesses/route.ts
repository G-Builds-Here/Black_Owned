/**
 * GET /api/pending-businesses
 *
 * Returns businesses with "pending_review" status for the admin review page.
 * Response includes: name, address, source, rating
 *
 * Query params (LOC-0100): ?prioritize=quality reorders items in memory by
 * listing-quality score ascending (weakest first, ties oldest-first). Only
 * that exact value does anything — the unflagged order, envelope, and item
 * shape are unchanged, and prioritization never persists.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findPendingByStatus } from "@/lib/db/pending-import-business-repository";
import { prioritizePendingByQuality } from "@/lib/quality/pending-import-priority";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";

export interface PendingBusinessResponse {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number | null;
  status: string;
  createdAt: string;
  description?: string;
  categoryId?: string;
  sourceData?: Record<string, unknown>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Opt-in quality-first ordering (LOC-0100): only the exact value "quality"
  // reorders; absent or any other value keeps today's behavior (blueprint DR-3).
  const prioritize = request.nextUrl.searchParams.get("prioritize");

  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  const client = await getPool().connect();

  try {
    const businesses = await findPendingByStatus(client, "pending_review");

    const result: PendingBusinessResponse[] = businesses.map((b) => {
      const sourceData = b.source_data as { source?: string; address?: string; rating?: number };
      return {
        id: b.id,
        name: b.name,
        address: sourceData?.address || "N/A",
        source: sourceData?.source || "unknown",
        rating: sourceData?.rating ?? null,
        status: b.status,
        createdAt: b.created_at.toISOString(),
        description: b.description,
        categoryId: b.category_id,
        sourceData: b.source_data as Record<string, unknown>,
      };
    });

    const data =
      prioritize === "quality" ? prioritizePendingByQuality(result) : result;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching pending businesses:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pending businesses" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
