/**
 * LOC-0053 — Admin console E2E
 *
 * Covers the admin surface rendering with a real admin-role user (users.role
 * promoted via psql, fresh login so the JWT carries the role): the dashboard
 * with its sections and review-queue link, the user management page with
 * email search, and the scraping console.
 */

import { test, expect, beforeAll, afterAll } from '@playwright/test';
import {
  BASE_URL,
  type E2ESession,
  E2E_PASSWORD,
  loginUser,
  newSession,
  psql,
  promoteAdmin,
  seedSession,
  warmRoutes,
} from './e2e-utils';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let admin: E2ESession;

beforeAll(async () => {
  admin = await newSession('e2e-admin-console');
  promoteAdmin(admin.email);
  admin = await loginUser(admin.email, E2E_PASSWORD);
  await warmRoutes(['/admin', '/admin/users', '/admin/scrape']);
}, 120_000);

afterAll(() => {
  psql(`DELETE FROM users WHERE email='${admin.email}'`);
}, 60_000);

test('admin dashboard renders with its sections and review-queue link', async ({ page }) => {
  await seedSession(page, admin);
  await page.goto(`${BASE_URL}/admin`);

  await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible();
  // The console renders its sections as a tablist, not in-panel headings.
  await expect(page.getByRole('tab', { name: /review queue/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Jobs', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'User Management' })).toBeVisible();

  // Only the active tab panel is in the DOM, so the review-queue link
  // appears once the Review Queue tab is selected.
  await page.getByRole('tab', { name: /review queue/i }).click();
  await expect(page.locator('a[href="/admin/reviews"]')).toBeVisible({ timeout: 15_000 });
});

test('user management lists users and finds one by email search', async ({ page }) => {
  await seedSession(page, admin);
  await page.goto(`${BASE_URL}/admin/users`);

  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
  await expect(page.getByText(/manage user accounts/i)).toBeVisible();

  await page.locator('main input').first().fill(admin.email);
  await expect(page.getByText(admin.email).first()).toBeVisible({ timeout: 30_000 });
});

test('scraping console renders with job creation and active jobs', async ({ page }) => {
  await seedSession(page, admin);
  await page.goto(`${BASE_URL}/admin/scrape`);

  await expect(page.getByRole('heading', { name: 'Scraping Console' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create New Scrape Job' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active Scrape Jobs' })).toBeVisible();
});
