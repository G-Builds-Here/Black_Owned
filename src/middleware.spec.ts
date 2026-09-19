/**
 * @jest-environment node
 */

/**
 * Edge middleware guard acceptance tests (LOC-0092 AC2)
 *
 * The guard is the server-side door for /admin. Invoked directly (no
 * server) -- same direct-call pattern the repo uses for route handlers.
 * "Public pages untouched" is enforced by the matcher config: public
 * requests never enter this function, so the matcher assertion is the
 * executable form of that scenario.
 */

import { NextRequest } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { middleware, config } from "./middleware";
import { createSessionToken } from "@/lib/auth/session-cookie";
import { generateTestRsaPemPair } from "@/lib/auth/jwt-test-fixtures";

const { privateKey, publicKey } = generateTestRsaPemPair();
const foreign = generateTestRsaPemPair();

function adminRequest(cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue !== undefined) headers.cookie = `bw-session=${cookieValue}`;
  return new NextRequest("http://localhost/admin", { headers });
}

function locationPathname(response: { headers: Headers }): string {
  const location = response.headers.get("location") ?? "";
  return new URL(location, "http://localhost").pathname;
}

describe("middleware (/admin guard)", () => {
  beforeEach(() => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
  });

  afterAll(() => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
  });

  it("Middleware_MissingCookie_AdminRequest_RedirectsToLogin", async () => {
    const res = await middleware(adminRequest());
    expect(locationPathname(res)).toBe("/login");
  });

  it("Middleware_TamperedCookie_AdminRequest_RedirectsToLogin", async () => {
    // Signed with a key the verifier does not trust
    const saved = process.env.JWT_PRIVATE_KEY;
    process.env.JWT_PRIVATE_KEY = foreign.privateKey;
    const forged = await createSessionToken({ id: "attacker", role: "admin" });
    process.env.JWT_PRIVATE_KEY = saved;

    const res = await middleware(adminRequest(forged));
    expect(locationPathname(res)).toBe("/login");
  });

  it("Middleware_ExpiredCookie_AdminRequest_RedirectsToLogin", async () => {
    const key = await importPKCS8(privateKey, "RS256");
    const expired = await new SignJWT({ id: "admin-user-id", role: "admin" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key);

    const res = await middleware(adminRequest(expired));
    expect(locationPathname(res)).toBe("/login");
  });

  it("Middleware_ValidAdminCookie_AdminRequest_PassesThrough", async () => {
    const token = await createSessionToken({ id: "admin-user-id", role: "admin" });
    const res = await middleware(adminRequest(token));

    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
  });

  it("Middleware_ValidNonAdminCookie_AdminRequest_RedirectsToHome", async () => {
    const token = await createSessionToken({ id: "owner-user-id", role: "business_owner" });
    const res = await middleware(adminRequest(token));

    expect(locationPathname(res)).toBe("/");
  });

  it("Middleware_PublicKeyUnset_AdminRequest_RedirectsToLogin", async () => {
    const token = await createSessionToken({ id: "admin-user-id", role: "admin" });

    const saved = process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    try {
      const res = await middleware(adminRequest(token));
      expect(locationPathname(res)).toBe("/login");
    } finally {
      process.env.JWT_PUBLIC_KEY = saved;
    }
  });

  it("Middleware_MatcherConfig_OnlyGuardsAdminPaths", () => {
    expect(config.matcher).toEqual(["/admin/:path*"]);
  });
});
