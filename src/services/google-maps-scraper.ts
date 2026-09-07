/**
 * Google Maps Scraper Service
 *
 * Web scraper for extracting business data from Google Maps using Playwright.
 * Handles pagination to capture all results when more than 10 exist.
 */

import { Browser, Page, BrowserContext } from "playwright";
import {
  ScrapedBusiness,
  ScraperResult,
  ScraperOptions,
  ScraperJobState,
  ScraperSource,
} from "../types/scraper-result";

const DEFAULT_RESULTS_PER_PAGE = 10;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_DELAY_BETWEEN_PAGES_MS = 1000;

/**
 * Google Maps scraper class with pagination support
 */
export class GoogleMapsScraper {
  source: ScraperSource = ScraperSource.GOOGLE_MAPS;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: Required<Omit<ScraperOptions, "credentials">>;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
      delayBetweenPagesMs:
        options.delayBetweenPagesMs ?? DEFAULT_DELAY_BETWEEN_PAGES_MS,
      includeDuplicates: options.includeDuplicates ?? false,
    };
  }

  /**
   * Initialize the browser and context
   */
  private async initialize(): Promise<void> {
    if (this.context) {
      return;
    }

    try {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });

      this.context = await this.browser.newContext({
        // 900px tall so the full results feed renders without clipping the
        // last row (720px cut off the final result in the list).
        viewport: { width: 1280, height: 900 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
    } catch (error) {
      console.error("Failed to initialize browser:", error);
      throw new Error(
        `Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Scrape businesses from Google Maps with pagination
   */
  async scrape(
    query: string,
    location: string
  ): Promise<ScraperResult> {
    await this.initialize();

    if (!this.context) {
      throw new Error("Browser context not initialized");
    }

    const page = await this.context.newPage();
    const collectedBusinesses: ScrapedBusiness[] = [];
    const seenNames = new Set<string>();

    // Initialize job state outside try block for error handling access
    const jobState: ScraperJobState = {
      query,
      location,
      currentPage: 0,
      totalPages: 0,
      businessesCollected: [],
      isComplete: false,
    };

    // Process pages
    let currentPage = 1;
    let hasNextPage = true;

    try {
      // Navigate to Google Maps search
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(
        query
      )}/${encodeURIComponent(location)}`;
      // Google Maps is a heavy SPA that never settles to "networkidle"
      // (it keeps polling tiles/data), which makes a networkidle goto time
      // out and yield zero results. Wait for the DOM instead; the results
      // feed is awaited explicitly below.
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Wait for actual result rows to render. The list appears well after
      // DOMContentLoaded (SPA), so wait for a concrete result element rather
      // than a load event. div[role="article"] is the per-result container and
      // a.hfpxzc is the result-name link.
      let resultsLoaded = false;
      try {
        await page.waitForSelector('div[role="article"] a.hfpxzc', {
          timeout: 30000,
        });
        // Small settle so rating/address text nodes are populated.
        await page.waitForTimeout(1500);
        resultsLoaded = true;
      } catch {
        // Continue even if selector not found - may have different structure
        resultsLoaded = false;
      }

      while (hasNextPage && currentPage <= this.options.maxPages) {
        jobState.currentPage = currentPage;

        // Extract businesses from current page
        const businesses = await this.extractBusinessesFromPage(
          page,
          seenNames
        );

        collectedBusinesses.push(...businesses);
        jobState.businessesCollected = [...collectedBusinesses];

        // Check if we have more pages
        if (currentPage < this.options.maxPages) {
          hasNextPage = await this.goToNextPage(page, currentPage);
          if (hasNextPage) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.options.delayBetweenPagesMs)
            );
            currentPage++;
          }
        } else {
          hasNextPage = false;
        }

        jobState.totalPages = currentPage;
      }

      jobState.isComplete = true;

      return {
        businesses: collectedBusinesses,
        pagination: {
          currentPage,
          totalPages: currentPage,
          resultsPerPage: DEFAULT_RESULTS_PER_PAGE,
          totalResults: collectedBusinesses.length,
          hasNextPage,
        },
        source: ScraperSource.GOOGLE_MAPS,
        query,
        location,
        timestamp: new Date(),
      };
    } catch (error) {
      jobState.error =
        error instanceof Error ? error.message : String(error);
      jobState.isComplete = true;

      console.error("Error scraping Google Maps:", error);

      return {
        businesses: collectedBusinesses,
        pagination: {
          currentPage,
          totalPages: currentPage,
          resultsPerPage: DEFAULT_RESULTS_PER_PAGE,
          totalResults: collectedBusinesses.length,
          hasNextPage: false,
        },
        source: ScraperSource.GOOGLE_MAPS,
        query,
        location,
        timestamp: new Date(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Extract businesses from the current page
   */
  private async extractBusinessesFromPage(
    page: Page,
    seenNames: Set<string>
  ): Promise<ScrapedBusiness[]> {
    try {
      const businesses = await page.evaluate(() => {
        const results: Array<{
          name: string;
          address: string;
          phone?: string;
          website?: string;
          category?: string;
          rating?: number;
          reviewCount?: number;
          sourceId?: string;
        }> = [];

        // Each result in the Google Maps list is a div[role="article"].
        const rows = Array.from(document.querySelectorAll('div[role="article"]'));

        for (const row of rows) {
          // Result name link (a.hfpxzc), with a stable href-based fallback.
          const nameEl =
            (row.querySelector('a.hfpxzc') as HTMLElement) ||
            (row.querySelector('a[href*="/maps/place/"]') as HTMLElement);
          if (!nameEl) {
            continue;
          }

          const name = (
            nameEl.getAttribute("aria-label") ||
            nameEl.textContent ||
            ""
          ).trim();
          if (!name) {
            continue;
          }
          const sourceId = nameEl.getAttribute("href") ?? undefined;

          // Rating + review count come from a stable, human-readable
          // aria-label like "4.6 stars 1,046 Reviews".
          let rating: number | undefined;
          let reviewCount: number | undefined;
          const ratingEl = row.querySelector(
            '[aria-label*="stars"]'
          ) as HTMLElement;
          if (ratingEl) {
            const m = (ratingEl.getAttribute("aria-label") || "").match(
              /([\d.]+)\s*stars?\s*([\d,]+)?\s*reviews?/i
            );
            if (m) {
              rating = parseFloat(m[1]);
              if (m[2]) {
                reviewCount = parseInt(m[2].replace(/,/g, ""), 10);
              }
            }
          }
          // Fallbacks for when the aria-label format varies between loads:
          // the visible rating number (.MW4etd) and review count (.UY7F9).
          if (rating == null) {
            const rEl = row.querySelector(".MW4etd") as HTMLElement;
            if (rEl) {
              const p = parseFloat((rEl.textContent || "").trim());
              if (!isNaN(p) && p > 0 && p <= 5) {
                rating = p;
              }
            }
          }
          if (reviewCount == null) {
            const cEl = row.querySelector(".UY7F9") as HTMLElement;
            if (cEl) {
              const m2 = (cEl.textContent || "").match(/[\d,]+/);
              if (m2) {
                reviewCount = parseInt(m2[0].replace(/,/g, ""), 10);
              }
            }
          }

          // Category + address live on the meta line
          // "Category · [accessibility icons] · Street Address".
          let category = "";
          let address = "";
          const metaLine =
            (row.querySelector('.W4Efsd .W4Efsd') as HTMLElement) ||
            (row.querySelectorAll(".W4Efsd")[1] as HTMLElement);
          const metaText = metaLine
            ? (metaLine.textContent || "").trim()
            : "";
          if (metaText) {
            const parts = metaText
              .split("·")
              .map((s) => s.trim())
              .filter(Boolean);
            if (parts.length >= 2) {
              category = parts[0];
              address = parts[parts.length - 1];
            } else if (parts.length === 1) {
              address = parts[0];
            }
          }

          results.push({
            name,
            address,
            phone: undefined,
            website: undefined,
            category: category || undefined,
            rating,
            reviewCount,
            sourceId,
          });
        }

        return results;
      });

      // Filter duplicates in the Node.js context where seenNames is accessible
      const filteredBusinesses = businesses.filter((b) => {
        if (this.options.includeDuplicates) {
          return true;
        }
        if (seenNames.has(b.name)) {
          return false;
        }
        seenNames.add(b.name);
        return true;
      });

      return filteredBusinesses.map((b) => ({
        ...b,
        source: ScraperSource.GOOGLE_MAPS,
      }));
    } catch (error) {
      console.error("Error extracting businesses from page:", error);
      return [];
    }
  }

  /**
   * Navigate to the next page of results
   */
  private async goToNextPage(
    page: Page,
    currentPage: number
  ): Promise<boolean> {
    try {
      // Try to find and click the "Next" or "More" button
      const nextButtonSelectors = [
        'button[aria-label="Next"]',
        'button[aria-label="More places"]',
        'a[aria-label="Next page"]',
        '[class*="next"], [class*="Next"]',
        'button:has-text("Next")',
        'button:has-text("More")',
        'button:has-text("More places")',
        '[data-testid="pagination-next"]',
      ];

      for (const selector of nextButtonSelectors) {
        try {
          const nextButton = await page.$(selector);
          if (nextButton) {
            const isVisible = await nextButton.isVisible();
            const isDisabled = await nextButton.isDisabled();

            if (isVisible && !isDisabled) {
              await nextButton.click();
              await page.waitForLoadState("networkidle", { timeout: 10000 });
              return true;
            }
          }
        } catch {
          // Try next selector
          continue;
        }
      }

      // No next button found
      return false;
    } catch (error) {
      console.error("Error navigating to next page:", error);
      return false;
    }
  }

  /**
   * Get the current job state (for progress tracking)
   */
  getJobState(): ScraperJobState | null {
    return null; // Implementation detail - state is tracked per scrape call
  }
}

/**
 * Factory function to create a Google Maps scraper instance
 */
export function createGoogleMapsScraper(
  options: ScraperOptions = {}
): GoogleMapsScraper {
  return new GoogleMapsScraper(options);
}
