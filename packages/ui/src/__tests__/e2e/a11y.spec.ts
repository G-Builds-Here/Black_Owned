import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test('should report axe-core violations with selectors', async ({ page }) => {
    await page.goto('/');

    const axeResults = await new AxeBuilder({ page }).analyze();

    // Verify violations array exists and has length >= 1 if violations are found
    if (axeResults.violations.length > 0) {
      const firstViolation = axeResults.violations[0];
      expect(firstViolation).toBeDefined();
      expect(firstViolation.nodes.length).toBeGreaterThan(0);
      // Each node should have a target (CSS selector)
      expect(firstViolation.nodes[0].target).toBeDefined();
    }
  });

  test('should have no accessibility violations on home page', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
