/**
 * LOC-0074 — Approval workflow E2E
 *
 * Covers the admin review queue (/admin/reviews) end to end: pending
 * businesses seeded into pending_import_businesses appear with a count, the
 * search filter narrows the queue, and the detail modal drives both
 * decisions — Approve (status -> approved) and Reject (reason required,
 * status -> rejected + rejection_reason persisted).
 */

import { test, expect, beforeAll, afterAll } from '@playwright/test';
import crypto from 'node:crypto';
import {
  BASE_URL,
  type E2ESession,
  E2E_PASSWORD,
  RUN_SUFFIX,
  cleanupPendingRows,
  firstCategoryUuid,
  loginUser,
  newSession,
  psql,
  promoteAdmin,
  seedSession,
  warmRoutes,
} from './e2e-utils';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let admin: E2ESession;
// The live queue is not empty in general (manual/sourced pending rows exist);
// counts are derived from the DB at seed time, not hardcoded.
let initialPending = 0;
const names = {
  approve: `E2E Alpha Bakery ${RUN_SUFFIX}`,
  reject: `E2E Beta Books ${RUN_SUFFIX}`,
};
const ids = { approve: '', reject: '' };

beforeAll(async () => {
  admin = await newSession('e2e-admin-review');
  promoteAdmin(admin.email);
  admin = await loginUser(admin.email, E2E_PASSWORD);

  const categoryId = firstCategoryUuid();
  ids.approve = crypto.randomUUID();
  ids.reject = crypto.randomUUID();
  psql(
    `INSERT INTO pending_import_businesses (id, name, category_id, source, source_data) ` +
    `VALUES ('${ids.approve}', '${names.approve}', '${categoryId}', 'e2e-test', ` +
    `jsonb_build_object('address', '123 Alpha Way', 'rating', 4.5, 'source', 'e2e-test'))`
  );
  psql(
    `INSERT INTO pending_import_businesses (id, name, category_id, source, source_data) ` +
    `VALUES ('${ids.reject}', '${names.reject}', '${categoryId}', 'e2e-test', ` +
    `jsonb_build_object('address', '456 Beta Blvd', 'rating', 3.0, 'source', 'e2e-test'))`
  );
  initialPending = parseInt(
    psql(`SELECT COUNT(*) FROM pending_import_businesses WHERE status='pending_review'`),
    10
  );
  await warmRoutes(['/admin/reviews']);
}, 120_000);

afterAll(() => {
  cleanupPendingRows(Object.values(ids));
  psql(`DELETE FROM users WHERE email='${admin.email}'`);
}, 60_000);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('review queue lists the pending businesses with the count', async ({ page }) => {
  await seedSession(page, admin);
  await page.goto(`${BASE_URL}/admin/reviews`);

  await expect(page.getByRole('heading', { name: 'Business Review Queue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: names.approve })).toBeVisible();
  await expect(page.getByRole('heading', { name: names.reject })).toBeVisible();
  await expect(page.getByText(`${initialPending} businesses pending review`)).toBeVisible();
});

test('search narrows the queue by name', async ({ page }) => {
  await seedSession(page, admin);
  await page.goto(`${BASE_URL}/admin/reviews`);

  await page.getByPlaceholder('Search by name, address, or source...').fill('Alpha');
  await expect(page.getByRole('heading', { name: names.approve })).toBeVisible();
  await expect(page.getByRole('heading', { name: names.reject })).toHaveCount(0);
  await expect(page.getByText('1 businesses pending review')).toBeVisible();
});

test('approve: detail modal decision sets status to approved', async ({ page }) => {
  await seedSession(page, admin);
  await page.goto(`${BASE_URL}/admin/reviews`);

  await page.getByRole('heading', { name: names.approve }).click();
  await expect(page.getByText('Basic Information')).toBeVisible();
  await expect(page.getByText('Pending Review').first()).toBeVisible();
  await expect(page.getByText('123 Alpha Way').first()).toBeVisible();

  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  // The queue card (h3) disappears; a page-level success banner keeps the
  // name visible as plain text, so scope the "gone" check to headings.
  await expect(page.getByRole('heading', { name: names.approve })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(`${names.approve} approved`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`${initialPending - 1} businesses pending review`)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => psql(`SELECT status FROM pending_import_businesses WHERE id='${ids.approve}'`), {
      timeout: 15_000,
    })
    .toBe('approved');
});

test('reject: reason is required and persisted', async ({ page }) => {
  await seedSession(page, admin);
  await page.goto(`${BASE_URL}/admin/reviews`);

  await page.getByRole('heading', { name: names.reject }).click();
  await expect(page.getByText('Basic Information')).toBeVisible();

  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  const reason = page.getByPlaceholder('Enter a rejection reason...');
  await expect(reason).toBeVisible();

  const confirm = page.getByRole('button', { name: 'Confirm Reject', exact: true });
  await expect(confirm).toBeDisabled();
  await reason.fill('Duplicate listing');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // Same banner behavior as Approve: scope the "gone" check to headings.
  await expect(page.getByRole('heading', { name: names.reject })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(`${initialPending - 2} businesses pending review`)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () => psql(`SELECT status || '|' || COALESCE(rejection_reason, '') FROM pending_import_businesses WHERE id='${ids.reject}'`),
      { timeout: 15_000 }
    )
    .toBe('rejected|Duplicate listing');
});
