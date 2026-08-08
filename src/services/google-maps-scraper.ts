/**
 * Google Maps Scraper with Pagination Support
 *
 * Handles pagination to capture all results when more than 10 exist.
 * Implements duplicate detection across pages.
 */

import playwright from "playwright";
import { ScrapedBusiness, ScraperResult, ScraperOptions, ScraperJobState } from "../types/google-maps-scraper";

const DEFAULT_RESULTS_PER_PAGE = 10;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_DELAY_BETWEEN_PAGES_MS = 2000;

/**
 * Google Maps scraper class with pagination support
 */
export class GoogleMapsScraper {
  private options: Required<ScraperOptions>;
  private browser: playwright.Browser | null = null;
  private context: playwright.BrowserContext | null = null;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
      delayBetweenPagesMs: options.delayBetweenPagesMs ?? DEFAULT_DELAY_BETWEEN_PAGES_MS,
      includeDuplicates: options.includeDuplicates ?? false,
      headless: options.headless ?? true,
      credentials: options.credentials ?? undefined,
    };
  }

  /**
   * Initialize the browser and context
   */
  async initialize(): Promise<void> {
    if (this.browser && this.context) {
      return;
    }

    this.browser = await playwright.chromium.launch({
      headless: this.options.headless,
    });
    this.context = await this.browser.newContext();
  }

  /**
   * Close the browser and context
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
   * Detect if a login prompt is shown
   */
  private async detectLoginPrompt(page: playwright.Page): Promise<boolean> {
    try {
      const loginSelectors = [
        '[data-google-signin]',
        'button:has-text("Sign in")',
        '[aria-label*="Sign in"]',
        '.gb_ee, .gb_ge',
      ];

      for (const selector of loginSelectors) {
        const element = await page.$(selector);
        if (element) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Perform login if credentials are configured
   */
  private async performLogin(page: playwright.Page): Promise<boolean> {
    if (!this.options.credentials) {
      return false;
    }

    try {
      // Try to find and click sign in button
      const signInButton = await page.$('button:has-text("Sign in"), [data-google-signin]');
      if (signInButton) {
        await signInButton.click();
        await page.waitForLoadState("networkidle", { timeout: 10000 });
      }

      // Enter email
      const emailInput = await page.$('input[type="email"], #identifierId');
      if (emailInput) {
        await emailInput.fill(this.options.credentials.email);
        await page.keyboard.press("Enter");
        await page.waitForLoadState("networkidle", { timeout: 10000 });
      }

      // Enter password
      const passwordInput = await page.$('input[type="password"], #password');
      if (passwordInput) {
        await passwordInput.fill(this.options.credentials.password);
        await page.keyboard.press("Enter");
        await page.waitForLoadState("networkidle", { timeout: 10000 });
      }

      // Check if login was successful
      const isLoggedIn = await this.detectLoginPrompt(page);
      return !isLoggedIn;
    } catch (error) {
      console.error("Error performing login:", error);
      return false;
    }
  }

  /**
   * Extract businesses from the current page
   */
  private async extractBusinessesFromPage(
    page: playwright.Page,
    seenNames: Set<string>
  ): Promise<ScrapedBusiness[]> {
    const businesses = await page.evaluate(() => {
      const results: Array<{
        name: string;
        address: string;
        phone?: string;
        website?: string;
        category?: string;
        rating?: number;
        reviewCount?: number;
      }> = [];

      // Try multiple selector patterns for Google Maps business cards
      const businessElements = document.querySelectorAll(
        '[data-testid="resultCardButton"], .section-result, [role="article"], [data-place-id]'
      );

      for (const element of businessElements) {
        const nameEl = element.querySelector("h3, .section-result-title");
        const addressEl = element.querySelector('[data-item-id="address"], .section-result-location');
        const ratingEl = element.querySelector('[data-item-id^="rating"], .section-result-rating');
        const reviewEl = element.querySelector('[data-item-id^="reviews"], .section-result-reviews');

        if (nameEl) {
          results.push({
            name: nameEl.textContent?.trim() ?? "",
            address: addressEl?.textContent?.trim() ?? "",
            rating: ratingEl ? parseFloat(ratingEl.textContent ?? "0") : undefined,
            reviewCount: reviewEl ? parseInt(reviewEl.textContent?.replace(/[^0-9]/g, "") ?? "0", 10) : undefined,
          });
        }
      }

      return results;
    });

    // Filter out duplicates if not including duplicates
    const filteredBusinesses: ScrapedBusiness[] = [];
    for (const b of businesses) {
      if (this.options.includeDuplicates || !seenNames.has(b.name)) {
        seenNames.add(b.name);
        filteredBusinesses.push({
          ...b,
          source: "google-maps" as const,
        });
      }
    }

    return filteredBusinesses;
  }

  /**
   * Navigate to the next page of results
   */
  private async goToNextPage(page: playwright.Page, currentPage: number): Promise<boolean> {
    try {
      // Try to find and click the "Next" button
      const nextButtonSelectors = [
        'button[aria-label*="Next"], button[aria-label*="Next"], a[aria-label*="Next"], [aria-label*="Next"], .next-button, .pagination-next, [data-testid="pagination-next"]',
        'button:has-text("Next"), a:has-text("Next")',
        '[class*="next"], [class*="Next"]',
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

      // Check for login prompt and perform login if credentials are configured
      const loginPromptDetected = await this.detectLoginPrompt(page);
      if (loginPromptDetected && this.options.credentials) {
        const loginSuccessful = await this.performLogin(page);
        if (loginSuccessful) {
          // Re-navigate to search results after login
          await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });
        }
      }

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
        source: "google-maps",
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
        source: "google-maps",
        query,
        location,
        timestamp: new Date(),
      };
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
export function createGoogleMapsScraper(options: ScraperOptions = {}): GoogleMapsScraper {
  return new GoogleMapsScraper(options);
}
