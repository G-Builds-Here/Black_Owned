/**
 * Scrape Jobs API Route
 *
 * REST endpoint for creating scrape jobs.
 */

import { NextRequest, NextResponse } from "next/server";
import { createScrapeJob } from "@/lib/db/scrape-job-repository";
import { CreateScrapeJobInput } from "@/types/scrape-job";

/**
 * POST /api/scrape-jobs
 * Create a new scrape job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { source, query, location } = body;

    // Validate required fields
    if (!source || !query || !location) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: source, query, location",
          errors: [
            !source && { field: "source", message: "Source is required" },
            !query && { field: "query", message: "Query is required" },
            !location && { field: "location", message: "Location is required" },
          ].filter(Boolean),
        },
        { status: 400 }
      );
    }

    // Validate source
    const validSources = ["google-maps", "yelp", "facebook"];
    if (!validSources.includes(source)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid source",
          errors: [
            {
              field: "source",
              message: `Source must be one of: ${validSources.join(", ")}`,
            },
          ],
        },
        { status: 400 }
      );
    }

    const input: CreateScrapeJobInput = {
      source,
      query,
      location,
    };

    const result = await createScrapeJob(input);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: result.id,
          source: result.source,
          query: result.query,
          location: result.location,
          status: result.status,
          created_at: result.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Scrape job creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
