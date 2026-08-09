/**
 * Health Check API Route
 *
 * Returns service health status for monitoring and load balancer checks.
 * Checks database connectivity and returns 503 if database is unreachable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../lib/db/user-repository";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check database connectivity
    const client = await getPool().connect();
    try {
      await client.query("SELECT 1");
      // Database is reachable
      return NextResponse.json(
        {
          status: "healthy",
          timestamp: new Date().toISOString(),
          database: "connected",
        },
        { status: 200 }
      );
    } finally {
      client.release();
    }
  } catch {
    // Database is unreachable
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "unreachable",
      },
      { status: 503 }
    );
  }
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "Method not allowed",
    },
    { status: 405 }
  );
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "Method not allowed",
    },
    { status: 405 }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "Method not allowed",
    },
    { status: 405 }
  );
}
