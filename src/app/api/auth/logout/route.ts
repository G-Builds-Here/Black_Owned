/**
 * Logout API Route (LOC-0092 AC3)
 *
 * Shuts the server-side door: expires the bw-session cookie so the Edge
 * guard in src/middleware.ts treats the next /admin request as anonymous.
 *
 * Scope boundary (survey finding #21): the Valkey refresh token is NOT
 * revoked here -- the cookie is the guard's door, and this shuts it.
 */

import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session-cookie";

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.json({ success: true }, { status: 200 });
  clearSessionCookie(response);
  return response;
}
