/**
 * #59 — Search autocomplete + directory URL filter write-back (LOC-0037/0041)
 *
 * The search bar shows up to five live business-name suggestions while
 * typing, and the directory's category filter writes back to the URL so
 * the active view is shareable and survives a reload.
 */

import { test, expect } from '@playwright/test';
import { BASE_URL, apiJson } from './e2e-utils';

test.describe('Search autocomplete', () => {
  test('typing shows up to five suggestions and selecting one runs the search', async ({ page }) => {
    const { status, body } = await apiJson('/api/directory');
    expect(status).toBe(200);
    const businesses: Array<{ name: string }> = body.data?.businesses ?? [];
    test.skip(businesses.length === 0, 'no live directory businesses to suggest from');
    const target = businesses[0].name;
    test.skip(target.length < 2, 'business name too short to suggest');
    const prefix = target.slice(0, Math.min(6, target.length));

    await page.goto(`${BASE_URL}/search`);
    const input = page.getByRole('textbox', { name: 'Search businesses' });
    await input.click();
    await input.pressSequentially(prefix, { delay: 50 });

    const listbox = page.getByRole('listbox', { name: 'Search suggestions' });
    await expect(listbox).toBeVisible({ timeout: 15_000 });
    expect(await listbox.getByRole('option').count()).toBeLessThanOrEqual(5);

    const option = listbox.getByText(target, { exact: true });
    await expect(option).toBeVisible();
    await option.click();

    await expect(input).toHaveValue(target);
    // Picking the suggestion debounces into a search and lists the business
    await expect(page.getByText(target).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Directory URL filter write-back', () => {
  test('selecting a category writes it to the URL and survives a reload', async ({ page }) => {
    const { status, body } = await apiJson('/api/directory');
    expect(status).toBe(200);
    const categories: string[] = body.data?.facets?.categories ?? [];
    const businesses: Array<{ category: string }> = body.data?.businesses ?? [];
    const counts = new Map<string, number>();
    for (const b of businesses) counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    const category = categories.find((c) => (counts.get(c) ?? 0) > 0);
    test.skip(!category, 'no live category with businesses');

    await page.goto(`${BASE_URL}/directory`);
    await expect(page.getByRole('heading', { name: /Business Directory/i })).toBeVisible();

    // No filter active: the trigger reads "Category"
    await expect(page.getByRole('button', { name: 'Category', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Category', exact: true }).click();
    await page.getByRole('menuitem', { name: category, exact: true }).click();

    // Write-back: the category lands in the URL query string
    await expect(page).toHaveURL(/category=/);

    // Read-back: the trigger now shows the selected category
    await expect(page.getByRole('button', { name: category, exact: true })).toBeVisible();

    // The URL state survives a full reload
    await page.reload();
    await expect(page.getByRole('heading', { name: /Business Directory/i })).toBeVisible();
    await expect(page.getByRole('button', { name: category, exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
