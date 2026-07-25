/**
 * Verification Upload API Route
 *
 * Handles direct file uploads to MinIO via presigned URLs.
 * Validates URL expiry and returns appropriate HTTP status codes.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * GET handler for presigned URL validation
 * Validates that a presigned URL is still within its expiry window
 *
 * Query params:
 * - url: The presigned URL to validate
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing required parameter: url",
      },
      { status: 400 }
    );
  }

  try {
    // Parse the URL to extract expiry information
    try {
      const parsedUrl = new URL(url);
      const expiryParam = parsedUrl.searchParams.get("X-Amz-Expires");

      if (!expiryParam) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid presigned URL: missing expiry parameter",
          },
          { status: 400 }
        );
      }

      const expirySeconds = parseInt(expiryParam, 10);
      if (isNaN(expirySeconds) || expirySeconds <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid presigned URL: invalid expiry value",
          },
          { status: 400 }
        );
      }

      // Check if URL has expired by looking at X-Amz-Date
      const dateParam = parsedUrl.searchParams.get("X-Amz-Date");
      if (dateParam) {
        // Parse the date (format: YYYYMMDDTHHMMSSZ)
        const year = parseInt(dateParam.substring(0, 4), 10);
        const month = parseInt(dateParam.substring(4, 6), 10) - 1;
        const day = parseInt(dateParam.substring(6, 8), 10);
        const hour = parseInt(dateParam.substring(8, 10), 10);
        const minute = parseInt(dateParam.substring(10, 12), 10);
        const second = parseInt(dateParam.substring(12, 14), 10);

        const uploadTime = new Date(year, month, day, hour, minute, second);
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - uploadTime.getTime()) / 1000);

        if (elapsedSeconds > expirySeconds) {
          return NextResponse.json(
            {
              success: false,
              error: "Presigned URL expired",
              expired: true,
              elapsedSeconds,
              expirySeconds,
            },
            { status: 403 }
          );
        }

        const remainingSeconds = expirySeconds - elapsedSeconds;
        return NextResponse.json(
          {
            success: true,
            valid: true,
            remainingSeconds,
          },
          { status: 200 }
        );
      }

      // If no date param, assume valid (cannot verify expiry)
      return NextResponse.json(
        {
          success: true,
          valid: true,
        },
        { status: 200 }
      );
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid URL format",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Verification upload validation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for file upload validation
 * This endpoint validates the upload request before it goes to MinIO
 *
 * The actual file upload is handled directly by the client to MinIO
 * using the presigned URL. This endpoint provides validation feedback.
 */
export async function PUT(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing required parameter: url",
      },
      { status: 400 }
    );
  }

  try {
    const parsedUrl = new URL(url);
    const expiryParam = parsedUrl.searchParams.get("X-Amz-Expires");
    const dateParam = parsedUrl.searchParams.get("X-Amz-Date");

    if (!expiryParam || !dateParam) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid presigned URL",
        },
        { status: 400 }
      );
    }

    const expirySeconds = parseInt(expiryParam, 10);
    const year = parseInt(dateParam.substring(0, 4), 10);
    const month = parseInt(dateParam.substring(4, 6), 10) - 1;
    const day = parseInt(dateParam.substring(6, 8), 10);
    const hour = parseInt(dateParam.substring(8, 10), 10);
    const minute = parseInt(dateParam.substring(10, 12), 10);
    const second = parseInt(dateParam.substring(12, 14), 10);

    const uploadTime = new Date(year, month, day, hour, minute, second);
    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - uploadTime.getTime()) / 1000);

    if (elapsedSeconds > expirySeconds) {
      return NextResponse.json(
        {
          success: false,
          error: "Presigned URL expired",
          expired: true,
        },
        { status: 403 }
      );
    }

    // URL is valid, client can proceed with upload
    return NextResponse.json(
      {
        success: true,
        message: "URL valid, proceed with upload",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Verification upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
