/**
 * Google Maps Scraper Service
 *
 * Web scraper for extracting business data from Google Maps using Playwright.
 * Handles pagination to capture all results when more than 10 exist.
 */

import { Browser, Page, BrowserContext } from "playwright";
import {
  RawScrapedBusiness as ScrapedBusiness,
  ScraperResult,
  ScraperOptions,
  ScraperJobState,
} from "../types/scraper-result";
import { ScraperSource } from "../types/scrape-job";

const DEFAULT_RESULTS_PER_PAGE = 10;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_DELAY_BETWEEN_PAGES_MS = 1000;

/**
 * Google Maps scraper class with pagination support
 */
export class GoogleMapsScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: Required<ScraperOptions>;

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
        viewport: { width: 1280, height: 720 },
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
      await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });

      // Wait for results to load
      let resultsLoaded = false;
      try {
        await page.waitForSelector(
          '[data-testid="resultsList"] , .section-results, [role="feed"]',
          { timeout: 10000 }
        );
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
        source: "google-maps" as ScraperSource,
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
        source: "google-maps" as ScraperSource,
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
          rating?: number;
          reviewCount?: number;
        }> = [];

        // Try multiple selector patterns for Google Maps' DOM structure
        const businessElements = document.querySelectorAll(
          '[data-place-id], [role="article"], .section-result, [class*="place"], [data-testid="result"]'
        );

        for (const element of businessElements) {
          const nameEl = element.querySelector(
            'h3, .section-result-title, [class*="title"], [data-testid="place-title"]'
          );
          const addressEl = element.querySelector(
            '[class*="address"], [data-testid="place-address"], .section-result-addr'
          );
          const ratingEl = element.querySelector(
            '[class*="rating"], [data-testid="place-rating"]'
          );
          const reviewsEl = element.querySelector(
            '[class*="reviews"], [data-testid="place-review-count"]'
          );
          const phoneEl = element.querySelector(
            '[class*="phone"], [data-testid="place-phone"]'
          );
          const websiteEl = element.querySelector(
            'a[href*="http"], [class*="website"], [data-testid="place-website"]'
          );

          if (!nameEl) {
            continue;
          }

          const name = nameEl.textContent?.trim();
          if (!name) {
            continue;
          }

          const address = addressEl?.textContent?.trim() ?? "";
          const ratingText = ratingEl?.textContent?.trim() ?? "";
          const rating = this.parseRating(ratingText);
          const reviewCount = this.parseReviewCount(
            reviewsEl?.textContent?.trim() ?? ""
          );
          const phone = phoneEl?.textContent?.trim() ?? undefined;
          const website = websiteEl?.getAttribute("href") ?? undefined;

          results.push({
            name,
            address,
            phone,
            website,
            rating,
            reviewCount,
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
        source: "google-maps" as const,
      }));
    } catch (error) {
      console.error("Error extracting businesses from page:", error);
      return [];
    }
  }

  /**
   * Parse rating from text (e.g., "4.5" from "4.5 star")
   */
  private parseRating(text: string): number | undefined {
    const match = text.match(/(\d+\.?\d*)/);
    if (match) {
      const rating = parseFloat(match[1]);
      if (!isNaN(rating) && rating > 0 && rating <= 5) {
        return rating;
      }
    }
    return undefined;
  }

  /**
   * Parse review count from text (e.g., "123" from "123 reviews")
   */
  private parseReviewCount(text: string): number | undefined {
    const match = text.match(/(\d+)/);
    if (match) {
      const count = parseInt(match[1], 10);
      if (!isNaN(count) && count > 0) {
        return count;
      }
    }
    return undefined;
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
