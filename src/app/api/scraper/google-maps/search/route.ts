/**
 * Google Maps Search API Route
 *
 * POST /api/scraper/google-maps/search
 * Search Google Maps for businesses by query, location, and type
 */

import { NextRequest, NextResponse } from "next/server";
import {
  searchGoogleMapsSearch,
  validateSearchRequest,
  type GoogleMapsSearchRequest,
  type GoogleMapsSearchResponse,
  type SearchOptions,
} from "@/lib/scraper/google-maps-service";

/**
 * POST /api/scraper/google-maps/search
 * Search Google Maps for businesses
 *
 * Request body:
 * {
 *   query: string;        // Required: Search query
 *   location?: string;    // Optional: Location filter
 *   type?: string;        // Optional: Business type filter
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON in request body",
        },
        { status: 400 }
      );
    }

    // Validate request
    const validation = validateSearchRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const searchRequest = body as GoogleMapsSearchRequest;

    // Extract optional search options from query params
    const searchParams = new URL(request.url);
    const options: SearchOptions = {
      maxResults: parseInt(searchParams.get("maxResults") || "20", 10),
      timeout: parseInt(searchParams.get("timeout") || "30000", 10),
    };

    // Validate options
    if (options.maxResults < 1 || options.maxResults > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "maxResults must be between 1 and 100",
        },
        { status: 400 }
      );
    }

    if (options.timeout < 1000 || options.timeout > 120000) {
      return NextResponse.json(
        {
          success: false,
          error: "timeout must be between 1000ms and 120000ms",
        },
        { status: 400 }
      );
    }

    // Execute search
    const result: GoogleMapsSearchResponse = await searchGoogleMapsSearch(
      searchRequest,
      options
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in Google Maps search:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
