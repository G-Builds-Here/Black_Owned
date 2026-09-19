/**
 * @jest-environment node
 */

/**
 * Session Cookie Unit Tests (LOC-0092 AC1 helper layer)
 *
 * The Edge-safe session token contract: RS256 via jose, keys from env only,
 * verify fails closed to null. No fs, no jsonwebtoken -- this module must
 * stay importable from Edge middleware.
 */

import { SignJWT, importPKCS8 } from "jose";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  verifySessionCookie,
  setSessionCookie,
  clearSessionCookie,
} from "./session-cookie";
import { generateTestRsaPemPair } from "./jwt-test-fixtures";
import { NextResponse } from "next/server";

// Primary RSA key pair for the suite
const { privateKey, publicKey } = generateTestRsaPemPair();

// A second, unrelated pair -- tokens signed against this one must not verify
const foreign = generateTestRsaPemPair();

const ADMIN = { id: "admin-user-id", role: "admin" };

describe("session-cookie", () => {
  beforeEach(() => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
  });

  afterAll(() => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
  });

  it("SessionCookie_SignThenVerify_ReturnsIdAndRole", async () => {
    const token = await createSessionToken(ADMIN);
    expect(token.split(".")).toHaveLength(3);

    const session = await verifySessionCookie(token);
    expect(session).toEqual({ id: ADMIN.id, role: ADMIN.role });
  });

  it("SessionCookie_VerifyWithWrongPublicKey_ReturnsNull", async () => {
    // Token signed with the foreign private key -- our public key must reject it
    process.env.JWT_PRIVATE_KEY = foreign.privateKey;
    const token = await createSessionToken(ADMIN);
    process.env.JWT_PRIVATE_KEY = privateKey;

    const session = await verifySessionCookie(token);
    expect(session).toBeNull();
  });

  it("SessionCookie_VerifyExpiredToken_ReturnsNull", async () => {
    const key = await importPKCS8(privateKey, "RS256");
    const expiredToken = await new SignJWT({ id: ADMIN.id, role: ADMIN.role })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key);

    const session = await verifySessionCookie(expiredToken);
    expect(session).toBeNull();
  });

  it("SessionCookie_PublicKeyUnset_ReturnsNull", async () => {
    const token = await createSessionToken(ADMIN);

    const saved = process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    try {
      // Fail closed: unset verification key must yield null, never a throw
      await expect(verifySessionCookie(token)).resolves.toBeNull();
    } finally {
      process.env.JWT_PUBLIC_KEY = saved;
    }
  });

  it("SessionCookie_ClearCookie_SetsMaxAgeZero", () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("SessionCookie_SetCookie_UsesContractNameAndFlags", async () => {
    const response = NextResponse.json({ ok: true });
    await setSessionCookie(response, ADMIN);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=Lax");
  });
});
