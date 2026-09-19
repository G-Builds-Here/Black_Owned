/**
 * @jest-environment node
 */

/**
 * POST /api/auth/logout acceptance tests (LOC-0092 AC3)
 *
 * AC3's contract: logout clears the bw-session cookie (Max-Age=0), and the
 * cleared cookie is asserted THROUGH the guard -- the scenario's And clause
 * feeds the exact Set-Cookie value logout issued into middleware and
 * requires /login. The cookie, not the endpoint, is the door.
 */

import { NextRequest } from "next/server";
import { POST } from "./route";
import { middleware } from "@/middleware";

function logoutRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
}

describe("POST /api/auth/logout", () => {
  it("Logout_ClearsSessionCookie_MaxAgeZero", async () => {
    const res = await POST(logoutRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("bw-session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("ClearedCookie_ThenMiddleware_RedirectsToLogin", async () => {
    const res = await POST(logoutRequest());

    // Hand the guard exactly what the client now holds after logout
    const setCookie = res.headers.get("set-cookie") ?? "";
    const clearedCookie = setCookie.split(";")[0]; // "bw-session=" (cleared value)

    const adminReq = new NextRequest("http://localhost/admin", {
      headers: { cookie: clearedCookie },
    });
    const guard = await middleware(adminReq);

    const location = guard.headers.get("location") ?? "";
    expect(new URL(location, "http://localhost").pathname).toBe("/login");
  });
});
