/**
 * @jest-environment node
 */

/**
 * LOC-0094 AC3 scenario "Sign out then guarded page" — server composition.
 *
 * The component-level sign-out flow is covered by
 * src/components/ui/Navigation.logout.test.tsx (jsdom). The guard scenario
 * is server-side, so it is asserted here with zero mocks of the two merged
 * LOC-0092 pieces: the real logout route handler must expire bw-session,
 * and the real Edge middleware must then treat the next /admin visit (which
 * carries no bw-session cookie, because it was expired) as anonymous and
 * redirect it to /login. Both halves run against real code paths.
 *
 * Node env by necessity: session-cookie pulls in jose, whose ESM browser
 * build cannot be parsed under jsdom (same constraint as the LOC-0092 specs).
 */

import { NextRequest } from "next/server";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { middleware } from "@/middleware";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

describe("LOC-0094 sign-out → guard composition", () => {
  it("LogoutRoute_ExpiresSessionCookie_NextAdminRequest_GuardRedirectsToLogin", async () => {
    // Half one: the merged logout route (the door the header's Sign out
    // click POSTs to) expires the session cookie on its response.
    const logoutRes = await logoutHandler(
      new NextRequest("http://localhost/api/auth/logout", { method: "POST" })
    );
    expect(logoutRes.status).toBe(200);
    const setCookie = logoutRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");

    // Half two: with the cookie expired, the browser's next /admin request
    // carries no bw-session -- the real guard must bounce it to /login.
    const adminRes = await middleware(new NextRequest("http://localhost/admin"));
    const location = adminRes.headers.get("location") ?? "";
    expect(new URL(location, "http://localhost").pathname).toBe("/login");
  });
});
