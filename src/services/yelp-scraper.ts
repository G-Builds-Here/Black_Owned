/**
 * Yelp Scraper with Pagination Support
 *
 * Handles pagination to capture all results when more than 10 exist.
 * Implements duplicate detection across pages.
 */

import playwright from "playwright";
import { ScrapedBusiness, ScraperResult, ScraperOptions, ScraperJobState } from "../types/yelp-scraper";
import { UserAgentRotator } from "../lib/user-agent-rotator";

const DEFAULT_RESULTS_PER_PAGE = 10;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_DELAY_BETWEEN_PAGES_MS = 2000;

/**
 * Yelp scraper class with pagination support
 */
export class YelpScraper {
  private options: Required<ScraperOptions>;
  private browser: playwright.Browser | null = null;
  private context: playwright.BrowserContext | null = null;
  private userAgentRotator: UserAgentRotator;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
      delayBetweenPagesMs: options.delayBetweenPagesMs ?? DEFAULT_DELAY_BETWEEN_PAGES_MS,
      includeDuplicates: options.includeDuplicates ?? false,
      headless: options.headless ?? true,
    };
    this.userAgentRotator = new UserAgentRotator();
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
    const userAgent = this.userAgentRotator.getNextUserAgent();
    this.context = await this.browser.newContext({ userAgent });
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

      // Try multiple selector patterns for Yelp business cards
      const businessElements = document.querySelectorAll(
        ".business-name, .css-1c4t2b3, [data-testid='business-card'], .css-19t0mea"
      );

      for (const element of businessElements) {
        const nameEl = element.querySelector(".business-name, .css-1c4t2b3, [class*='name']");
        const addressEl = element.querySelector(".business-address, [class*='address']");
        const ratingEl = element.querySelector(".rating, [class*='rating'], [class*='stars']");
        const reviewEl = element.querySelector(".review-count, [class*='reviews']");

        if (nameEl) {
          results.push({
            name: nameEl.textContent?.trim() ?? "",
            address: addressEl?.textContent?.trim() ?? "",
            rating: ratingEl ? parseFloat(ratingEl.textContent ?? "0") : undefined,
            reviewCount: reviewEl ? parseInt(reviewEl.textContent ?? "0", 10) : undefined,
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
          source: "yelp" as const,
        });
      }
    }

    return filteredBusinesses;
  }

  /**
   * Scrape businesses from Yelp with pagination
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

    try {
      // Navigate to Yelp search
      const searchUrl = `https://www.yelp.com/search?find_desc=${encodeURIComponent(
        query
      )}&find_loc=${encodeURIComponent(location)}`;
      await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });

      // Wait for results to load
      let resultsLoaded = false;
      try {
        await page.waitForSelector(".business-name, .css-1c4t2b3", {
          timeout: 10000,
        });
        resultsLoaded = true;
      } catch {
        // Continue even if selector not found - may have different structure
        resultsLoaded = false;
      }

      // Initialize job state
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
      let hasMoreResults = true;

      while (hasMoreResults && currentPage <= this.options.maxPages) {
        jobState.currentPage = currentPage;

        // Extract businesses from current page
        const pageBusinesses = await this.extractBusinessesFromPage(
          page,
          seenNames
        );

        // Update job state
        jobState.businessesCollected = [...collectedBusinesses, ...pageBusinesses];

        if (pageBusinesses.length === 0 && currentPage === 1) {
          // No results on first page
          hasMoreResults = false;
          break;
        }

        collectedBusinesses.push(...pageBusinesses);

        // Check for next page
        if (currentPage < this.options.maxPages) {
          hasMoreResults = await this.goToNextPage(page, currentPage);
          if (hasMoreResults) {
            // Wait between page navigations to avoid rate limiting
            await new Promise((resolve) =>
              setTimeout(resolve, this.options.delayBetweenPagesMs)
            );
            currentPage++;
          }
        } else {
          hasMoreResults = false;
        }
      }

      jobState.totalPages = currentPage;
      jobState.isComplete = true;

      // Calculate pagination info
      const totalResults = collectedBusinesses.length;
      const totalPages = Math.ceil(totalResults / DEFAULT_RESULTS_PER_PAGE);

      return {
        businesses: collectedBusinesses,
        pagination: {
          currentPage,
          totalPages: totalPages || 0,
          resultsPerPage: DEFAULT_RESULTS_PER_PAGE,
          totalResults,
          hasNextPage: hasMoreResults,
        },
        source: "yelp",
        query,
        location,
        timestamp: new Date(),
      };
    } catch (error) {
      jobState.error =
        error instanceof Error ? error.message : String(error);
      jobState.isComplete = true;

      console.error("Error scraping Yelp:", error);

      return {
        businesses: collectedBusinesses,
        pagination: {
          currentPage,
          totalPages: 0,
          resultsPerPage: DEFAULT_RESULTS_PER_PAGE,
          totalResults: collectedBusinesses.length,
          hasNextPage: false,
        },
        source: "yelp",
        query,
        location,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Navigate to the next page of results
   */
  private async goToNextPage(page: playwright.Page, currentPage: number): Promise<boolean> {
    try {
      // Try to find and click the "Next" button
      const nextButtonSelectors = [
        'button[aria-label="Next page"]',
        'a[aria-label="Next"]',
        '[class*="next"], [class*="Next"]',
        'button:has-text("Next")',
        'a:has-text("Next")',
        'button:has-text("More results")',
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
 * Factory function to create a Yelp scraper instance
 */
export function createYelpScraper(options: ScraperOptions = {}): YelpScraper {
  return new YelpScraper(options);
}
