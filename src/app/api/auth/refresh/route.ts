/**
 * Token Refresh API Route
 *
 * POST /api/auth/refresh
 *
 * Accepts a refresh token and returns a new token pair.
 * The refresh token is validated against Valkey and rotated.
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/auth/token-refresh";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    // Validate refresh token is provided
    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Refresh token is required",
        },
        { status: 400 }
      );
    }

    // Attempt to refresh the access token
    const result = await refreshAccessToken(refreshToken);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        tokens: result.tokens,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Token refresh endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
