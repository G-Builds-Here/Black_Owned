/**
 * Health Check API Route
 *
 * Returns service health status for monitoring and load balancer checks.
 * Includes database and NATS connectivity status.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../lib/db/user-repository";
import { checkNatsHealth } from "../../../lib/nats/nats-client";

interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  database?: {
    status: "healthy" | "unhealthy";
  };
  nats?: {
    status: "healthy" | "unhealthy";
    latency_ms?: number;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const timestamp = new Date().toISOString();

  // Check database connectivity
  let dbStatus: "healthy" | "unhealthy" = "unhealthy";
  let overallStatus: "healthy" | "unhealthy" = "unhealthy";

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      // Run a simple query to verify connectivity
      await client.query("SELECT 1");
      dbStatus = "healthy";
      overallStatus = "healthy";
    } finally {
      client.release();
    }
  } catch {
    // Database is unreachable - keep defaults
    dbStatus = "unhealthy";
    overallStatus = "unhealthy";
  }

  // Check NATS connectivity
  let natsStatus: "healthy" | "unhealthy" = "unhealthy";
  let natsLatencyMs: number | undefined = undefined;
  try {
    const natsResult = await checkNatsHealth();
    natsStatus = natsResult.healthy ? "healthy" : "unhealthy";
    natsLatencyMs = natsResult.latencyMs;
  } catch {
    natsStatus = "unhealthy";
  }

  // Overall status is unhealthy if either DB or NATS is unhealthy
  if (natsStatus === "unhealthy") {
    overallStatus = "unhealthy";
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp,
    database: {
      status: dbStatus,
    },
    nats: {
      status: natsStatus,
      ...(natsLatencyMs !== undefined && { latency_ms: natsLatencyMs }),
    },
  };

  const statusCode = overallStatus === "healthy" ? 200 : 503;

  return NextResponse.json(response, { status: statusCode });
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
