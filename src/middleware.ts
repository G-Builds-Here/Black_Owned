/**
 * Edge Middleware -- server-side guard for /admin (LOC-0092 AC2)
 *
 * The admin section was previously guarded only by client-side JS
 * (survey finding #8 / anti-pattern #13): admin HTML shipped to anyone and
 * the page-level check was cosmetic. This is the real door -- it runs
 * before any admin page renders.
 *
 * Edge runtime: verifySessionCookie is jose/Web-Crypto only (no fs, no
 * jsonwebtoken). It fails CLOSED to null, and the catch below fails closed
 * too -- this function can never 500 the admin section.
 *
 * Non-admin redirects to "/" per the ticket (the old client guard used
 * /owner; the server guard is authoritative).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionCookie(token) : null;

    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (session.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  } catch {
    // Fail closed: an unexpected guard error must never open the door
    // nor crash every /admin request into a 500.
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  // Public paths never enter this function -- the guard is /admin-only.
  matcher: ["/admin/:path*"],
};
