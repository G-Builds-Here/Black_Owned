/**
 * Shared helpers for the Playwright E2E suites (LOC-0053 / LOC-0074).
 *
 * Fixtures are created against the live stack through the public APIs and
 * psql (docker exec), and torn down in afterAll hooks. Emails/names are
 * unique per run so the suites are re-runnable.
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import type { Page } from '@playwright/test';

export const BASE_URL = 'http://localhost:3000';
export const SESSION_KEY = 'black-owned.session';
export const E2E_PASSWORD = 'Passw0rd!e2e';
export const RUN_SUFFIX = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;

export interface E2ESession {
  email: string;
  password: string;
  name: string;
  id: string;
  role: string;
  accessToken: string;
  refreshToken: string;
  /** Server-minted `bw-session` cookie value captured from the login
   *  response's Set-Cookie header (LOC-0092: the Edge guard reads this
   *  cookie; localStorage alone no longer satisfies /admin). */
  sessionCookie?: string;
}

/**
 * Run one psql statement against the app database.
 *
 * Windows: execSync goes through cmd.exe, so the SQL argument is wrapped in
 * double quotes and must not contain double quotes itself (use single quotes
 * for SQL strings and jsonb_build_object() instead of inline JSON).
 */
export function psql(sql: string): string {
  const out = execSync(
    `docker exec black-owned-postgres psql -U postgres -d black_owned -t -A -c "${sql}"`,
    { encoding: 'utf8' }
  );
  return out.trim();
}

export interface ApiResult {
  status: number;
  body: Record<string, any>;
  /** Raw Set-Cookie header values from the response (server-minted state). */
  setCookie: string[];
}

export async function apiJson(
  path: string,
  init?: { method?: string; body?: unknown; token?: string }
): Promise<ApiResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie')?.split(/,\s*(?=[^;]+?=)/) ?? []);
  return { status: res.status, body, setCookie };
}

/** Pull the `bw-session` value out of captured Set-Cookie header values. */
function extractSessionCookie(setCookie: string[]): string | undefined {
  for (const raw of setCookie) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq >= 0 && pair.slice(0, eq).trim() === 'bw-session') {
      const value = pair.slice(eq + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

export async function registerUser(name: string, email: string, password: string): Promise<void> {
  const { status, body } = await apiJson('/api/auth/register', {
    method: 'POST',
    body: { email, password, name },
  });
  if (status >= 400) {
    throw new Error(`register ${email} failed: ${status} ${JSON.stringify(body).slice(0, 300)}`);
  }
}

export async function loginUser(email: string, password: string): Promise<E2ESession> {
  const res = await apiJson('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status >= 400 || !res.body?.tokens?.accessToken) {
    throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  return {
    email,
    password,
    name: res.body.user?.name ?? email,
    id: res.body.user?.id ?? '',
    role: res.body.user?.role ?? 'user',
    accessToken: res.body.tokens.accessToken,
    refreshToken: res.body.tokens.refreshToken,
    sessionCookie: extractSessionCookie(res.setCookie),
  };
}

/** Register a brand-new user and return a logged-in session for it. */
export async function newSession(prefix: string, name?: string): Promise<E2ESession> {
  const email = `${prefix}-${RUN_SUFFIX}@example.com`;
  await registerUser(name ?? `E2E ${prefix}`, email, E2E_PASSWORD);
  return loginUser(email, E2E_PASSWORD);
}

export function userIdByEmail(email: string): string {
  return psql(`SELECT id::text FROM users WHERE email='${email}'`);
}

export function promoteAdmin(email: string): void {
  psql(`UPDATE users SET role='admin' WHERE email='${email}'`);
}

/** One real category id from the live DB (categories.id is uuid, text form). */
export function firstCategoryUuid(): string {
  const id = psql(`SELECT id::text FROM categories LIMIT 1`);
  if (!id) throw new Error('no categories seeded in the live DB');
  return id;
}

/** Claim a business as `session` (sets owner_id, status unverified). */
export async function claimBusiness(
  session: E2ESession,
  name: string,
  categoryId?: string
): Promise<{ id: string; status: string }> {
  const cat = categoryId ?? firstCategoryUuid();
  const { status, body } = await apiJson('/api/businesses/claim', {
    method: 'POST',
    token: session.accessToken,
    body: { name, categoryId: cat },
  });
  const biz = body?.data?.business;
  if (status >= 400 || !biz?.id) {
    throw new Error(`claim ${name} failed: ${status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { id: biz.id, status: biz.status ?? '' };
}

/**
 * Sign the browser in as `session`: client state in localStorage (what the
 * app UI reads) PLUS the server-minted `bw-session` cookie replayed into the
 * browser context (what the Edge guard on /admin reads since LOC-0092).
 * The cookie value comes from the real login response's Set-Cookie header --
 * E2E auth state must be server-minted, never client-fabricated
 * (test-writing-standards.md, Mock Fidelity Ladder corollary).
 */
export async function seedSession(page: Page, session: E2ESession): Promise<void> {
  await page.goto(BASE_URL);
  await page.evaluate(
    ([key, s]) => {
      localStorage.setItem(key, JSON.stringify({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: { id: s.id, email: s.email, name: s.name, role: s.role },
      }));
    },
    [SESSION_KEY, session] as const
  );
  if (session.sessionCookie) {
    // Flags mirror src/lib/auth/session-cookie.ts SESSION_COOKIE_FLAGS.
    // addCookies takes either url OR domain+path (never both) -- domain+path
    // mirrors the server's flags exactly (path=/ applies to the whole origin).
    await page.context().addCookies([{
      name: 'bw-session',
      value: session.sessionCookie,
      domain: new URL(BASE_URL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }]);
  }
}

/**
 * Trigger Next dev route compilation for these paths so the first in-browser
 * visit doesn't race a cold compile (>15s on first hit, observed in #56).
 *
 * Pass `session` for guarded paths (/admin/** since LOC-0092): the request
 * carries the server-minted cookie so the guard lets it through and the route
 * actually compiles. A middleware redirect (307/308) is NOT warm -- the
 * redirect short-circuits before compilation, and counting it warm is what
 * re-introduced the #56 cold-compile timeout for /admin.
 */
export async function warmRoutes(paths: string[], session?: E2ESession): Promise<void> {
  const headers = session?.sessionCookie
    ? { Cookie: `bw-session=${session.sessionCookie}` }
    : undefined;
  for (const p of paths) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const res = await fetch(`${BASE_URL}${p}`, headers ? { headers } : undefined);
        if (res.status < 500 && res.status !== 307 && res.status !== 308) return;
      } catch {
        /* server not ready yet */
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export function cleanupChatFixtures(emails: string[], businessIds: string[]): void {
  for (const biz of businessIds) {
    psql(`DELETE FROM messages WHERE business_id='${biz}'`);
    psql(`DELETE FROM conversations WHERE business_id='${biz}'`);
    psql(`DELETE FROM businesses WHERE id='${biz}'`);
  }
  for (const email of emails) {
    psql(`DELETE FROM users WHERE email='${email}'`);
  }
}

export function cleanupPendingRows(ids: string[]): void {
  if (ids.length > 0) {
    psql(`DELETE FROM pending_import_businesses WHERE id IN (${ids.map((i) => `'${i}'`).join(',')})`);
  }
}
