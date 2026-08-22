/**
 * GET /api/pending-businesses
 *
 * Returns businesses with "pending_review" status for the admin review page.
 * Response includes: name, address, source, rating
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findPendingByStatus } from "@/lib/db/pending-import-business-repository";
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

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching pending businesses:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending businesses" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
