/**
 * LOC-0095 — End-to-end login journey E2E
 *
 * The login epic (LOC-0092 session cookie + guard, LOC-0093 GraphQL auth
 * context, LOC-0094 session-aware header) verified as a unit through the
 * real app: admin logs in through the form and reaches /admin, an anonymous
 * context is redirected away, logout closes both halves of the session, and
 * GraphQL identity rides the real browser cookie jar.
 *
 * One file per the AC Test Contract (class: e2e). The admin fixture is
 * created through the public register API and promoted to admin via psql
 * (repo seed convention, e2e-utils), then re-logged-in so the minted
 * bw-session cookie carries the admin role claim. Unique email/name per run
 * keep the spec re-runnable; seeded rows are torn down in afterAll.
 */

import { test, expect, beforeAll, afterAll, type Page } from '@playwright/test';
import {
  BASE_URL,
  type E2ESession,
  E2E_PASSWORD,
  RUN_SUFFIX,
  firstCategoryUuid,
  loginUser,
  newSession,
  psql,
  promoteAdmin,
  userIdByEmail,
  warmRoutes,
} from './e2e-utils';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

// AC fixture "user-admin-1" (role admin), run-unique so the spec is re-runnable.
const ADMIN_NAME = `user-admin-1-${RUN_SUFFIX}`;
const ADMIN_EMAIL = `user-admin-1-${RUN_SUFFIX}@example.com`;

let admin: E2ESession;
let categoryId: string;
const createdBusinessNames: string[] = [];

beforeAll(async () => {
  const seeded = await newSession('user-admin-1', ADMIN_NAME);
  promoteAdmin(seeded.email);
  // Fresh login so the server-minted bw-session cookie carries role=admin.
  admin = await loginUser(ADMIN_EMAIL, E2E_PASSWORD);
  categoryId = firstCategoryUuid();
  // Warm every route this spec touches; /admin under the admin cookie so the
  // guard passes and the route actually compiles (e2e-utils warmRoutes note).
  await warmRoutes(['/', '/login', '/owner', '/admin'], admin);
}, 180_000);

afterAll(() => {
  for (const name of createdBusinessNames) {
    psql(`DELETE FROM businesses WHERE name='${name}'`);
  }
  psql(`DELETE FROM users WHERE email='${ADMIN_EMAIL}'`);
}, 60_000);

/** Fill and submit the real login form (the AC1 "submits valid credentials" step). */
async function loginViaForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

/** Run a GraphQL document from inside the browser context -- the cookie jar
 *  (server-minted bw-session) rides the request exactly as in the product. */
async function graphQLInBrowser(page: Page, query: string): Promise<Record<string, any>> {
  return page.evaluate(async (q) => {
    const res = await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    return res.json();
  }, query);
}

// The route's mini-GraphQL parses createBusiness by inline-literal regex --
// this string matches that shape exactly (same convention as the LOC-0093
// jest contract). The selection set is free-form after the match.
function privateMutation(bizName: string): string {
  return `mutation { createBusiness(input: { name: "${bizName}", description: "e2e login journey fixture", categoryId: "${categoryId}" }) { success business { id name } } }`;
}

// ---------------------------------------------------------------------------
// AC1: Admin login journey end to end
// ---------------------------------------------------------------------------

test('AC1: admin logs in through the form, header shows identity, /admin opens', async ({ page }) => {
  await loginViaForm(page, ADMIN_EMAIL, E2E_PASSWORD);

  // Post-login redirect target is /owner (src/app/login/page.tsx).
  await expect(page).toHaveURL(`${BASE_URL}/owner`, { timeout: 30_000 });

  // Session-aware header (LOC-0094): the admin's name and "Sign out".
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByText(ADMIN_NAME)).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // Navigating to /admin: HTTP 200, no redirect (the Edge guard lets the
  // admin-role session through), admin section rendered.
  const res = await page.goto(`${BASE_URL}/admin`);
  expect(res?.status()).toBe(200);
  expect(page.url()).toBe(`${BASE_URL}/admin`);
  await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible({ timeout: 30_000 });
});

// ---------------------------------------------------------------------------
// AC2: Anonymous guard and logout close the loop
// ---------------------------------------------------------------------------

test('AC2: anonymous context is redirected from /admin to /login', async ({ page }) => {
  // The user-observable outcome of the Edge guard's 3xx is the landing URL:
  // an anonymous visit to /admin ends up on /login (never on the admin
  // section). Chromium's redirectChain does not reliably surface middleware
  // 307s, so the contract is asserted at the URL, not the transport hop.
  await page.goto(`${BASE_URL}/admin`);
  await expect(page).toHaveURL(`${BASE_URL}/login`);
  // The admin section itself never rendered.
  await expect(page.getByRole('heading', { name: 'Admin Console' })).toHaveCount(0);
});

test('AC2: logout closes the loop -- header reverts and /admin re-redirects', async ({ page }) => {
  await loginViaForm(page, ADMIN_EMAIL, E2E_PASSWORD);
  await expect(page).toHaveURL(`${BASE_URL}/owner`, { timeout: 30_000 });

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await nav.getByRole('button', { name: 'Sign out' }).click();

  // Signed-out landing on / with the anonymous header (Sign in / Register).
  await expect(page).toHaveURL(`${BASE_URL}/`);
  await expect(nav.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Register' })).toBeVisible();

  // The same browser context -- server cookie expired, client store cleared:
  // /admin redirects to /login again.
  await page.goto(`${BASE_URL}/admin`);
  await expect(page).toHaveURL(`${BASE_URL}/login`);
});

// ---------------------------------------------------------------------------
// AC3: GraphQL identity holds through the real stack
// ---------------------------------------------------------------------------

test('AC3: private mutation returns data for the admin context', async ({ page }) => {
  await loginViaForm(page, ADMIN_EMAIL, E2E_PASSWORD);
  await expect(page).toHaveURL(`${BASE_URL}/owner`, { timeout: 30_000 });

  const bizName = `e2e-login-journey-biz-${RUN_SUFFIX}`;
  createdBusinessNames.push(bizName);
  const body = await graphQLInBrowser(page, privateMutation(bizName));

  expect(body.errors).toBeUndefined();
  expect(body.data?.createBusiness?.success).toBe(true);

  // Identity really rode the cookie: the row is owned by the signed-in admin.
  const ownerId = psql(`SELECT owner_id::text FROM businesses WHERE name='${bizName}'`);
  expect(ownerId).toBe(admin.id || userIdByEmail(ADMIN_EMAIL));
});

test('AC3: same private mutation is UNAUTHENTICATED in a fresh anonymous context', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  const body = await graphQLInBrowser(page, privateMutation(`e2e-login-journey-anon-${RUN_SUFFIX}`));

  expect(body.data?.createBusiness).toBeNull();
  expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
});

test('AC3: public listing query returns data in the anonymous context', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  const body = await graphQLInBrowser(
    page,
    'query { searchBusinesses(query: "e2e", page: 1, pageSize: 5) { total } }'
  );

  // Public browsing unregressed: 200-shape envelope with data, no auth error.
  expect(body.errors).toBeUndefined();
  expect(typeof body.data?.searchBusinesses?.total).toBe('number');
});
