/**
 * Quality Score API Route
 *
 * POST /api/quality-score — score a caller-supplied listing payload with the
 * pure completeness scorer (LOC-0098). Deliberately DB-free: the route reads
 * the request body, shape-checks it manually (no validation library,
 * LOC-0096 constraint), and delegates all scoring to the pure module.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import {
  scoreQualityListing,
  QualityScorePayload,
} from "@/lib/quality/listing-quality-score";

/** 400 with the repo-standard {success: false, error, code} error envelope. */
function badRequest(error: string, code: string): NextResponse {
  return NextResponse.json(
    { success: false, error, code },
    { status: 400 }
  );
}

/**
 * POST /api/quality-score
 * Admin-guarded: scores the posted listing payload and answers with the
 * standard {success, data} envelope. Rejected callers get the same guard
 * error response every other admin-guarded endpoint returns.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(
      authResult.errorType!,
      authResult.errorMessage!
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON", "INVALID_JSON");
  }

  // Manual shape checks (no validation library — LOC-0096 constraint). The
  // scorer itself is total over garbage, so only the request envelope is
  // checked here: a listing object carrying at least a name.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return badRequest("Request body must be a listing object", "INVALID_BODY");
  }

  const name = (body as { name?: unknown }).name;
  if (typeof name !== "string" || name.trim().length === 0) {
    return badRequest(
      'Field "name" is required and must be a non-empty string',
      "MISSING_NAME"
    );
  }

  const result = scoreQualityListing(body as QualityScorePayload);
  return NextResponse.json({ success: true, data: result });
}
