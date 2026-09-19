/**
 * @jest-environment node
 */

/**
 * LOC-0092 QA fidelity specs (Bruce)
 *
 * The LOC-0092 acceptance suites run against the repo's hand-rolled
 * __mocks__/next-server.ts (jest maps `next/server` there for every spec),
 * so their cookie assertions only prove the MOCK's serialization. These
 * tests bypass the map with jest.requireActual and assert the REAL
 * NextResponse/NextRequest cookie behavior the Edge guard depends on in
 * production. If this suite goes red, the mock has been lying -- that is an
 * implementation finding, not a test to delete.
 *
 * Zero jest.mock here by design: the whole point is reality. Production
 * helpers (setSessionCookie/clearSessionCookie/verifySessionCookie) are
 * driven against real Next classes.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { generateTestRsaPemPair } from "@/lib/auth/jwt-test-fixtures";
import {
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  verifySessionCookie,
} from "@/lib/auth/session-cookie";
import type { NextResponse } from "next/server";

const real = jest.requireActual("next/server") as typeof import("next/server");
const RealNextResponse = real.NextResponse;
const RealNextRequest = real.NextRequest;

const { privateKey, publicKey } = generateTestRsaPemPair();
const ADMIN = { id: "qa-admin-id", role: "admin" };

describe("LOC-0092 real next/server seam fidelity", () => {
  beforeEach(() => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
  });

  afterAll(() => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
  });

  it("RealNextResponse_SetSessionCookie_SerializesContractFlagsOnRealHeader", async () => {
    const res = RealNextResponse.json({ ok: true });

    // Production helper writing through the REAL response cookie jar
    await setSessionCookie(res as unknown as NextResponse, ADMIN);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("RealNextResponse_ClearSessionCookie_EmptyValueAndMaxAgeZero", async () => {
    const res = RealNextResponse.json({ ok: true });

    clearSessionCookie(res as unknown as NextResponse);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("RealNextRequest_CookieHeaderRoundTrip_VerifiesAsAdmin", async () => {
    // Issue: production helper on a real response...
    const res = RealNextResponse.json({ ok: true });
    await setSessionCookie(res as unknown as NextResponse, ADMIN);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const token = setCookie.split(";")[0].slice(`${SESSION_COOKIE_NAME}=`.length);

    // ...consume: real request parses what the real response issued...
    const req = new RealNextRequest("http://localhost/admin", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const readBack = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    expect(readBack).toBe(token);

    // ...and the guard's verifier accepts the round-tripped session.
    const session = await verifySessionCookie(readBack ?? "");
    expect(session).toEqual(ADMIN);
  });

  it("RealNextRequest_SessionCookieAmongOthers_StillReadsValue", async () => {
    const token = "alpha.beta.gamma";
    const req = new RealNextRequest("http://localhost/admin", {
      headers: { cookie: `other=1; ${SESSION_COOKIE_NAME}=${token}; third=2` },
    });

    expect(req.cookies.get(SESSION_COOKIE_NAME)?.value).toBe(token);
  });

  it("VerifySessionCookie_EmptyToken_ReturnsNullFailClosed", async () => {
    // The cleared cookie reaches the guard as an empty value (AC3's And
    // clause); verification must fail closed to null, never throw.
    await expect(verifySessionCookie("")).resolves.toBeNull();
  });
});

describe("LOC-0092 matcher shape against the build-compiled matcher", () => {
  // The guard's door is ONLY /admin -- the compiled matcher regexp is what
  // Next actually enforces at the edge. Read it from the build manifest so
  // bypass shapes are pinned against the real compiled form, not a copy.
  const manifestPath = resolve(__dirname, "../../.next/server/middleware-manifest.json");
  const manifestExists = existsSync(manifestPath);
  const describeManifest = manifestExists ? describe : describe.skip;

  if (!manifestExists) {
    // Loud, not silent: this suite only counts as evidence when it ran.
    // eslint-disable-next-line no-console
    console.warn(
      `[LOC-0092 fidelity] SKIPPED matcher-shape tests: ${manifestPath} not found -- run \`npm run build\` first.`
    );
  }

  const manifest = manifestExists
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;
  const matcher = manifest?.middleware?.["/"]?.matchers?.[0]?.regexp as string | undefined;

  it.each(["/admin", "/admin/", "/admin/users", "/admin/users/1", `/_next/data/x/admin`])(
    "MiddlewareMatcherManifest_RegexpGuards_%s",
    (path) => {
      expect(matcher).toBeDefined();
      expect(new RegExp(matcher as string).test(path)).toBe(true);
    }
  );

  it.each(["/administration", "/adminx", "/Admin", "/login", "/"])(
    "MiddlewareMatcherManifest_RegexpRejects_%s",
    (path) => {
      expect(matcher).toBeDefined();
      expect(new RegExp(matcher as string).test(path)).toBe(false);
    }
  );
});
