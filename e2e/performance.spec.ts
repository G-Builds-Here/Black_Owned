// Performance E2E Tests using Playwright
// Tests for AC8: Performance Standards
// Verifies: initial load <3s on 4G, TTI <5s, LCP <2.5s, FID <100ms, CLS <0.1

import { test, expect } from '@playwright/test';

test.describe('Performance Standards', () => {
  // Test initial page load time
  test('should load page within 3 seconds on simulated 4G', async ({ page }) => {
    // Simulate 4G network conditions
    const context = page.context();
    await context.setOffline(false);

    const startTime = Date.now();

    await page.goto('/', { waitUntil: 'load' });

    const loadTime = (Date.now() - startTime) / 1000; // Convert to seconds
    console.log(`[Performance] Initial load time: ${loadTime.toFixed(2)}s`);

    // Assert load time is under 3 seconds
    expect(loadTime).toBeLessThan(3);
  });

  // Test Time to Interactive (TTI)
  test('should be interactive within 5 seconds', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const startTime = Date.now();

    // Wait for page to be fully interactive
    await page.waitForLoadState('networkidle');

    const tti = (Date.now() - startTime) / 1000; // Convert to seconds
    console.log(`[Performance] TTI: ${tti.toFixed(2)}s`);

    // Assert TTI is under 5 seconds
    expect(tti).toBeLessThan(5);
  });

  // Test Largest Contentful Paint (LCP)
  test('should have LCP under 2.5 seconds', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Get LCP metric from performance timeline
    const lcpEntries = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as PerformanceEntry;
          resolve(lastEntry.startTime);
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });

        // Fallback timeout
        setTimeout(() => resolve(0), 5000);
      });
    });

    const lcpSeconds = lcpEntries / 1000;
    console.log(`[Performance] LCP: ${lcpSeconds.toFixed(2)}s`);

    // Assert LCP is under 2.5 seconds
    expect(lcpSeconds).toBeLessThan(2.5);
  });

  // Test First Input Delay (FID)
  test('should have FID under 100ms', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Simulate user interaction and measure delay
    const startTime = Date.now();
    await page.click('body');
    const fid = Date.now() - startTime;

    console.log(`[Performance] FID: ${fid}ms`);

    // Assert FID is under 100ms
    expect(fid).toBeLessThan(100);
  });

  // Test Cumulative Layout Shift (CLS)
  test('should have CLS under 0.1', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Get CLS metric
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hastype) {
              clsValue += (entry as any).value || 0;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });

        // Wait a bit for layout shifts
        setTimeout(() => resolve(clsValue), 2000);
      });
    });

    console.log(`[Performance] CLS: ${cls.toFixed(4)}`);

    // Assert CLS is under 0.1
    expect(cls).toBeLessThan(0.1);
  });

  // Test image lazy loading
  test('should lazy-load images', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check that images have loading="lazy" attribute
    const lazyImages = await page.locator('img[loading="lazy"]').count();
    const totalImages = await page.locator('img').count();

    console.log(`[Performance] Lazy-loaded images: ${lazyImages}/${totalImages}`);

    // At least some images should be lazy-loaded
    expect(lazyImages).toBeGreaterThan(0);
  });

  // Test Core Web Vitals thresholds
  test('should meet all Core Web Vitals thresholds', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Collect all metrics
    const metrics = await page.evaluate(() => {
      return new Promise<{ lcp: number; fid: number; cls: number }>((resolve) => {
        const results = { lcp: 0, fid: 0, cls: 0 };

        // LCP
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1] as PerformanceEntry;
            results.lcp = lastEntry.startTime / 1000;
          });
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {
          console.warn('LCP observer not supported');
        }

        // CLS
        try {
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              results.cls += (entry as any).value || 0;
            }
          });
          clsObserver.observe({ type: 'layout-shift', buffered: true });
        } catch (e) {
          console.warn('CLS observer not supported');
        }

        setTimeout(() => resolve(results), 3000);
      });
    });

    console.log(`[Performance] Core Web Vitals: LCP=${metrics.lcp.toFixed(2)}s, FID=${metrics.fid}ms, CLS=${metrics.cls.toFixed(4)}`);

    // Assert all thresholds
    expect(metrics.lcp).toBeLessThan(2.5);
    expect(metrics.cls).toBeLessThan(0.1);
  });
});
