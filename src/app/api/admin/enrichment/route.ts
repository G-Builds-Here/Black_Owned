/**
 * Admin Enrichment Proxy Route
 *
 * POST /api/admin/enrichment
 *
 * Admin-gated proxy to the bw-scraper enrichment worker. The request body
 * ({limit?, businessIds?}) is forwarded verbatim to POST /enrich at
 * SCRAPER_BASE_URL (default http://localhost:8080); the worker's
 * per-business report is wrapped in the standard {success, data} envelope
 * as data.report.
 *
 * The worker is unauthenticated by design (internal operator endpoint,
 * same exposure as /scrape); this admin route is the auth gate. The
 * outbound fetch is bounded by a 60 s timeout because runs are bounded
 * by the worker's limit + rate limiter.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";

/** Outbound worker call bound — runs are bounded by limit + rate limiter. */
const ENRICH_TIMEOUT_MS = 60_000;

/** Per-business report entry returned by bw-scraper POST /enrich. */
export interface EnrichBusinessResult {
  id: string;
  name: string;
  applied: string[];
  skipped: string[];
  error: string | null;
}

export interface EnrichSummary {
  total: number;
  enriched: number;
  skipped: number;
  failed: number;
}

export interface EnrichReport {
  businesses: EnrichBusinessResult[];
  summary: EnrichSummary;
}

/** Read at request time so env overrides (e.g. tests) take effect. */
function scraperBaseUrl(): string {
  return process.env.SCRAPER_BASE_URL ?? "http://localhost:8080";
}

/**
 * POST /api/admin/enrichment
 *
 * Forward the body verbatim to the worker's POST /enrich and wrap its
 * report. Auth failures return the standard 401/403 auth envelope; worker
 * failures return 502 with a machine-readable code so the console can
 * render a readable banner instead of a raw error.
 */
export async function POST(request: NextRequest) {
  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  const rawBody = await request.text();

  let workerResponse: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);
    const response = await fetch(`${scraperBaseUrl()}/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody.length > 0 ? rawBody : "{}",
      signal: controller.signal,
    });
    clearTimeout(timer);
    workerResponse = response;
  } catch {
    console.error("Enrichment worker unreachable");
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: "Enrichment worker unreachable",
        code: "ENRICHMENT_WORKER_UNREACHABLE",
      },
      { status: 502 }
    );
  }

  if (!workerResponse.ok) {
    const detail = await workerResponse.text();
    console.error(`Enrichment worker responded ${workerResponse.status}:`, detail);
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: `Enrichment worker responded with status ${workerResponse.status}`,
        code: "ENRICHMENT_WORKER_ERROR",
        detail,
      },
      { status: 502 }
    );
  }

  let report: EnrichReport;
  try {
    report = (await workerResponse.json()) as EnrichReport;
  } catch (error) {
    console.error("Failed to parse enrichment worker response:", error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: "Enrichment worker returned an invalid report",
        code: "ENRICHMENT_INVALID_REPORT",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { report },
  });
}
