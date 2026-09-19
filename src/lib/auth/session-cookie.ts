/**
 * Session Cookie (LOC-0092)
 *
 * The server-readable session behind the /admin guard: an RS256 JWT carried
 * in an httpOnly `bw-session` cookie. This module is imported by Edge
 * middleware, so it must stay Edge-safe: jose (Web Crypto) only -- no fs,
 * no jsonwebtoken, no auth-service. Keys come from env vars ONLY; the
 * config/jwt/*.pem file fallback in auth-service is deliberately absent
 * (survey anti-pattern #12 -- the Edge runtime cannot read disk, and the
 * committed fallback keys must not gain new dependents).
 *
 * Contract exposed to LOC-0094 (do not rename): SESSION_COOKIE_NAME,
 * setSessionCookie, clearSessionCookie, verifySessionCookie, flags
 * httpOnly / path=/ / sameSite=lax.
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from "jose";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "bw-session";

const SESSION_COOKIE_FLAGS = {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
} as const;

/**
 * Session token lifetime. Matches the refresh window so an actively-used
 * admin session survives a full workday without re-login.
 */
const SESSION_TOKEN_EXPIRY = "7d";

export interface SessionUser {
  id: string;
  role: string;
}

/**
 * Sign the session cookie value (RS256, claims id + role).
 * Throws if JWT_PRIVATE_KEY is unset -- callers are route handlers with
 * their own 500 path; a login that cannot mint a session must not half-succeed.
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const pem = process.env.JWT_PRIVATE_KEY;
  if (!pem) {
    throw new Error("JWT_PRIVATE_KEY is not set -- cannot sign session token");
  }
  const key = await importPKCS8(pem, "RS256");
  return new SignJWT({ id: user.id, role: user.role })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TOKEN_EXPIRY)
    .sign(key);
}

// Public keys are stable per process; importing via Web Crypto is not free,
// and the Edge module scope stays warm between requests. Keyed by PEM string
// so a key rotation (or a wrong-key test) gets its own entry.
const publicKeyCache = new Map<string, KeyLike>();

/**
 * Verify a session cookie value. Fails CLOSED: unset JWT_PUBLIC_KEY, bad
 * signature, expired exp, or non-string id/role claims all yield null --
 * never a throw, so middleware can never 500 the whole admin section.
 */
export async function verifySessionCookie(token: string): Promise<SessionUser | null> {
  const pem = process.env.JWT_PUBLIC_KEY;
  if (!pem) {
    return null;
  }
  try {
    let key = publicKeyCache.get(pem);
    if (!key) {
      key = await importSPKI(pem, "RS256");
      publicKeyCache.set(pem, key);
    }
    const { payload } = await jwtVerify(token, key, { algorithms: ["RS256"] });
    const { id, role } = payload;
    if (typeof id !== "string" || typeof role !== "string") {
      return null;
    }
    return { id, role };
  } catch {
    return null;
  }
}

/**
 * Attach a fresh session cookie to a route response (mutation style --
 * NextResponse carries its own cookie jar).
 */
export async function setSessionCookie(
  response: NextResponse,
  user: SessionUser
): Promise<void> {
  const token = await createSessionToken(user);
  response.cookies.set(SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_FLAGS });
}

/**
 * Expire the session cookie in place. Does NOT revoke the Valkey refresh
 * token -- accepted scope boundary (survey finding #21); the guard's door
 * is the cookie, and this shuts it.
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_FLAGS,
    maxAge: 0,
  });
}
