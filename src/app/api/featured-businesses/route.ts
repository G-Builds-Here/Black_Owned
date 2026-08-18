/**
 * Featured Businesses API Route
 *
 * GET /api/featured-businesses
 * Returns the most recent scraped businesses for the homepage
 * "Featured Businesses" section. Backed by the scraped_businesses
 * table that the scraper populates.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { initializeScrapeJobSchema } from "@/lib/db/scrape-job-repository";
import {
  initializeScrapedBusinessSchema,
  findFeaturedScrapedBusinesses,
} from "@/lib/db/scraped-business-repository";

/**
 * GET /api/featured-businesses?limit=10
 * List the most recent scraped businesses (default 10).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(50, parsed)) : 10;

  const client = await getPool().connect();
  try {
    // Ensure both tables exist before querying (scraped_businesses FK -> scrape_jobs).
    await initializeScrapeJobSchema(client);
    await initializeScrapedBusinessSchema(client);

    const businesses = await findFeaturedScrapedBusinesses(client, limit);

    return NextResponse.json({
      success: true,
      data: businesses.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        category: b.category ?? undefined,
        rating: b.rating ?? undefined,
        reviewCount: b.reviewCount ?? undefined,
        source: b.source,
      })),
    });
  } catch (error) {
    console.error("Error fetching featured businesses:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
