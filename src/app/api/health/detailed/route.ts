/**
 * Detailed Health Check API Route
 *
 * Returns comprehensive service health information including uptime, version,
 * and all service statuses for monitoring and diagnostics.
 */

import { NextRequest, NextResponse } from "next/server";

interface ServiceStatus {
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  details?: Record<string, unknown>;
}

interface DetailedHealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  uptime_seconds: number;
  version: string;
  services: ServiceStatus[];
}

// Track server start time for uptime calculation
const startTime = Date.now();

// Service status checkers
const serviceCheckers: Array<{ name: string; check: () => Promise<ServiceStatus> }> = [
  {
    name: "database",
    check: async (): Promise<ServiceStatus> => {
      return {
        name: "database",
        status: "unknown",
        details: {
          reason: "Database connection check not configured",
        },
      };
    },
  },
  {
    name: "nats",
    check: async (): Promise<ServiceStatus> => {
      return {
        name: "nats",
        status: "unknown",
        details: {
          reason: "NATS connection check not configured",
        },
      };
    },
  },
  {
    name: "minio",
    check: async (): Promise<ServiceStatus> => {
      return {
        name: "minio",
        status: "unknown",
        details: {
          reason: "MinIO connection check not configured",
        },
      };
    },
  },
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const now = Date.now();
  const uptimeSeconds = Math.floor((now - startTime) / 1000);

  // Check all services in parallel
  const serviceStatuses = await Promise.all(
    serviceCheckers.map(async (checker) => {
      try {
        return await checker.check();
      } catch {
        return {
          name: checker.name,
          status: "unhealthy" as const,
          details: {
            reason: "Service check failed",
          },
        };
      }
    })
  );

  // Overall status is healthy only if all services are healthy
  const overallStatus = serviceStatuses.every(
    (s) => s.status === "healthy"
  )
    ? "healthy"
    : "unhealthy";

  const response: DetailedHealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime_seconds: uptimeSeconds,
    version: process.env.npm_package_version || "0.1.0",
    services: serviceStatuses,
  };

  return NextResponse.json(response, { status: 200 });
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
