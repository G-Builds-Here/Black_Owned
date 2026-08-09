/**
 * GET /api/pending-businesses
 *
 * Returns businesses with "pending_review" status for the admin review page.
 * Response includes: name, address, source, rating
 */

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findPendingByStatus } from "@/lib/db/pending-import-business-repository";

export interface PendingBusinessResponse {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number | null;
  status: string;
  createdAt: string;
}

export async function GET() {
  const client = await getPool().connect();

  try {
    const businesses = await findPendingByStatus(client, "pending_review");

    const result: PendingBusinessResponse[] = businesses.map((b) => {
      const sourceData = b.source_data as { source?: string };
      return {
        id: b.id,
        name: b.name,
        address: (b.source_data as { address?: string })?.address || "N/A",
        source: sourceData?.source || "unknown",
        rating: (b.source_data as { rating?: number })?.rating ?? null,
        status: b.status,
        createdAt: b.created_at.toISOString(),
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
