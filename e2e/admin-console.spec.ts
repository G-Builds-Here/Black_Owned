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
  RUN_SUFFIX,
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
  await warmRoutes(['/admin', '/admin/users', '/admin/scrape', '/admin/reviews']);
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

test('active jobs tab shows pending and running jobs, auto-refreshes, and links to review results', async ({ page }) => {
  const qA = `e2e-active-a-${RUN_SUFFIX}`;
  const qB = `e2e-active-b-${RUN_SUFFIX}`;
  const qC = `e2e-active-c-${RUN_SUFFIX}`;

  psql(`INSERT INTO scrape_jobs (source, query, location, status) VALUES ('Google Maps', '${qA}', 'E2E, GA', 'pending')`);
  psql(`INSERT INTO scrape_jobs (source, query, location, status) VALUES ('Google Maps', '${qB}', 'E2E, GA', 'running')`);

  try {
    await seedSession(page, admin);
    await page.goto(`${BASE_URL}/admin/scrape`);
    await page.getByRole('tab', { name: /Active Jobs/ }).click();

    await expect(page.getByText(`Query: ${qA}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Query: ${qB}`)).toBeVisible();

    // Polling: a pending job created while the tab is open must appear
    // without a manual refresh (5s interval).
    psql(`INSERT INTO scrape_jobs (source, query, location, status) VALUES ('Google Maps', '${qC}', 'E2E, GA', 'pending')`);
    await expect(page.getByText(`Query: ${qC}`)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Review Results' }).click();
    await expect(page).toHaveURL(/\/admin\/reviews\/?$/);
    await expect(page.getByRole('heading', { name: 'Business Review Queue' })).toBeVisible({ timeout: 15_000 });
  } finally {
    psql(`DELETE FROM scrape_jobs WHERE query IN ('${qA}', '${qB}', '${qC}')`);
  }
});
