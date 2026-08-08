/**
 * Yelp Search API Route
 *
 * Endpoint for searching businesses on Yelp.
 */

import { NextRequest, NextResponse } from "next/server";
import { createYelpScraper } from "@/services/yelp-scraper";

/**
 * GET /api/scraper/yelp/search
 * Search for businesses on Yelp
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Validate required parameters
    const query = searchParams.get("query");
    const location = searchParams.get("location");

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: query",
          details: "Query parameter is required",
        },
        { status: 400 }
      );
    }

    if (!location) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: location",
          details: "Location parameter is required",
        },
        { status: 400 }
      );
    }

    // Optional pagination parameters
    const maxPages = parseInt(searchParams.get("maxPages") || "10", 10);
    const delayBetweenPagesMs = parseInt(
      searchParams.get("delayBetweenPagesMs") || "1000",
      10
    );

    // Validate pagination parameters
    if (maxPages < 1 || maxPages > 50) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid maxPages parameter",
          details: "maxPages must be between 1 and 50",
        },
        { status: 400 }
      );
    }

    if (delayBetweenPagesMs < 0 || delayBetweenPagesMs > 10000) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid delayBetweenPagesMs parameter",
          details: "delayBetweenPagesMs must be between 0 and 10000",
        },
        { status: 400 }
      );
    }

    // Create scraper and execute search
    const scraper = createYelpScraper({
      maxPages,
      delayBetweenPagesMs,
    });

    try {
      const result = await scraper.scrape(query, location);

      return NextResponse.json(
        {
          success: true,
          data: {
            source: "yelp",
            query,
            location,
            businesses: result.businesses,
            pagination: result.pagination,
            timestamp: result.timestamp.toISOString(),
          },
        },
        { status: 200 }
      );
    } finally {
      await scraper.close();
    }
  } catch (error) {
    console.error("Yelp search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
