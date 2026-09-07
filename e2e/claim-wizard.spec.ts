/**
 * LOC-0053 — Claim wizard E2E (3-step claim flow, /business/claim)
 *
 * Covers: the sign-in gate for anonymous visitors and the full signed-in
 * flow (real category select, ownership confirmation, submit, success card,
 * unverified business visible on /owner). Requires the dev server on :3000
 * and the Postgres container.
 */

import { test, expect, afterAll } from '@playwright/test';
import {
  BASE_URL,
  type E2ESession,
  E2E_PASSWORD,
  RUN_SUFFIX,
  newSession,
  psql,
  seedSession,
  warmRoutes,
} from './e2e-utils';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let claimedName = '';
let claimantEmail = '';

afterAll(() => {
  if (claimedName) {
    const bizId = psql(`SELECT id::text FROM businesses WHERE name='${claimedName}'`);
    if (bizId) psql(`DELETE FROM businesses WHERE id='${bizId}'`);
  }
  if (claimantEmail) {
    psql(`DELETE FROM users WHERE email='${claimantEmail}'`);
  }
});

test('anonymous visitor reaches the sign-in gate at the final step', async ({ page }) => {
  await warmRoutes(['/business/claim']);
  await page.goto(`${BASE_URL}/business/claim`);

  await expect(page.getByRole('heading', { name: 'Claim Your Business' })).toBeVisible();
  await expect(page.getByText(/three quick steps/i)).toBeVisible();
  await page.getByPlaceholder('Enter your business name').fill('E2E Gate Co');

  // The category list loads client-side from /api/categories; wait for it.
  await expect
    .poll(async () => page.locator('#category option').count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  await page.locator('#category').selectOption({ index: 1 });

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: /confirm ownership/i })).toBeVisible();
  await page.locator('#ownership').check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByRole('heading', { name: /sign in to submit/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create Account' })).toBeVisible();
});

test('signed-in user completes the three-step claim and sees it on /owner', async ({ page }) => {
  const user = await newSession('e2e-claim');
  claimantEmail = user.email;
  claimedName = `E2E Claim Test ${RUN_SUFFIX}`;

  await warmRoutes(['/business/claim', '/owner']);
  await seedSession(page, user);
  await page.goto(`${BASE_URL}/business/claim`);

  // Step 1 of 3: business details (category populated from /api/categories).
  await page.getByPlaceholder('Enter your business name').fill(claimedName);
  // The category list loads client-side from /api/categories; wait for it.
  await expect
    .poll(async () => page.locator('#category option').count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  await page.locator('#category').selectOption({ index: 1 });
  await page.getByPlaceholder('City, State').fill('Testville, CA');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Step 2 of 3: ownership confirmation gates the button.
  await expect(page.getByRole('heading', { name: /confirm ownership/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.locator('#ownership').check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Step 3 of 3: session confirmed, submit.
  await expect(page.getByText(`Signing in as ${user.email}`)).toBeVisible();
  await page.getByRole('button', { name: 'Submit Claim', exact: true }).click();

  await expect(page.getByRole('heading', { name: `${claimedName} has been claimed!` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/unverified/i)).toBeVisible();

  // The new unverified business appears on the owner dashboard.
  await page.goto(`${BASE_URL}/owner`);
  await expect(page.getByText(claimedName).first()).toBeVisible({ timeout: 30_000 });

  const row = psql(`SELECT verification_status || '|' || owner_id::text FROM businesses WHERE name='${claimedName}'`);
  expect(row).toContain('unverified');
  expect(row).toContain(user.id);
});
