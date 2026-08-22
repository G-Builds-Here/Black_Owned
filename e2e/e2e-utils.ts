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
  accessToken: string;
  refreshToken: string;
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
  return { status: res.status, body };
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
  const { status, body } = await apiJson('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (status >= 400 || !body?.tokens?.accessToken) {
    throw new Error(`login ${email} failed: ${status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return {
    email,
    password,
    name: body.user?.name ?? email,
    id: body.user?.id ?? '',
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
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

/** Write the client session into localStorage so the app sees the user as signed in. */
export async function seedSession(page: Page, session: E2ESession): Promise<void> {
  await page.goto(BASE_URL);
  await page.evaluate(
    ([key, s]) => {
      localStorage.setItem(key, JSON.stringify({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: { id: s.id, email: s.email, name: s.name },
      }));
    },
    [SESSION_KEY, session] as const
  );
}

/**
 * Trigger Next dev route compilation for these paths so the first in-browser
 * visit doesn't race a cold compile (>15s on first hit, observed in #56).
 */
export async function warmRoutes(paths: string[]): Promise<void> {
  for (const p of paths) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const res = await fetch(`${BASE_URL}${p}`);
        if (res.status < 500) return;
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
