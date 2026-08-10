/**
 * Yelp Scraper Service
 *
 * Web scraper for extracting business data from Yelp using Playwright.
 * Handles pagination to capture all results when more than 10 exist.
 * Includes bot detection and retry handling.
 */

import { Browser, Page, BrowserContext } from "playwright";
import {
  ScrapedBusiness,
  ScraperResult,
  ScraperOptions,
  ScraperJobState,
} from "../types/yelp-scraper";
import { ScraperSource } from "../types/scrape-job";
import { BotDetectionService, createBotDetectionService } from "./bot-detection-service";

const DEFAULT_RESULTS_PER_PAGE = 10;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_DELAY_BETWEEN_PAGES_MS = 1000;
const DEFAULT_BOT_RETRY_DELAY_MS = 60000; // 60 seconds

/**
 * Yelp scraper class with pagination support
 */
export class YelpScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: Required<ScraperOptions>;
  private botDetection: BotDetectionService;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
      delayBetweenPagesMs:
        options.delayBetweenPagesMs ?? DEFAULT_DELAY_BETWEEN_PAGES_MS,
      includeDuplicates: options.includeDuplicates ?? false,
    };
    this.botDetection = createBotDetectionService({
      retryDelayMs: DEFAULT_BOT_RETRY_DELAY_MS,
      maxRetries: 3,
    });
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
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

      // Check for bot detection challenge
      const pageContent = await page.content();
      const botResult = this.botDetection.detectBotChallenge(pageContent, "yelp");

      if (botResult.isBotDetected) {
        console.log(
          `[YelpScraper] Bot detected: ${botResult.challengeType}, retry attempt ${botResult.retryCount + 1}/3`
        );

        if (botResult.shouldRetry) {
          // Pause for 60 seconds before retry
          await this.botDetection.pauseForRetry("yelp");
          this.botDetection.incrementRetryCount("yelp");

          // Retry the page load
          await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });
          resultsLoaded = false;
          try {
            await page.waitForSelector(".business-name, .css-1c4t2b3", {
              timeout: 10000,
            });
            resultsLoaded = true;
          } catch {
            resultsLoaded = false;
          }
        } else {
          throw new Error(
            `Bot detection triggered: ${botResult.challengeType}. Max retries exceeded.`
          );
        }
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
          totalPages,
          resultsPerPage: DEFAULT_RESULTS_PER_PAGE,
          totalResults,
          hasNextPage: false,
        },
        source: "yelp",
        query,
        location,
        timestamp: new Date(),
      };
    } catch (error) {
      jobState.error = error instanceof Error ? error.message : "Unknown error";
      jobState.isComplete = false;
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Extract business data from the current page
   */
  private async extractBusinessesFromPage(
    page: Page,
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

      // Try multiple selector patterns for Yelp's DOM structure
      const businessElements = document.querySelectorAll(
        '[data-ref-id], .business-name, [class*="business"], .css-1c4t2b3, .css-1b54l8d'
      );

      for (const element of businessElements) {
        const nameEl = element.querySelector(
          '.business-name, [class*="business-name"], h3, a[href*="/biz/"]'
        );
        const name = nameEl?.textContent?.trim();

        if (!name) continue;

        // Extract address
        const addressEl = element.querySelector(
          '[class*="address"], .css-1xqzgp8, .css-159b55y'
        );
        const address = addressEl?.textContent?.trim() || "";

        // Extract rating
        const ratingEl = element.querySelector(
          '[class*="rating"], [class*="star"], .css-1m0v5q6'
        );
        const ratingText = ratingEl?.textContent || "";
        const ratingMatch = ratingText.match(/(\d\.?\d*)\s*star/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

        // Extract review count
        const reviewEl = element.querySelector(
          '[class*="review"], [class*="count"]'
        );
        const reviewText = reviewEl?.textContent || "";
        const reviewCountMatch = reviewText.match(/(\d+)\s*review/i);
        const reviewCount = reviewCountMatch
          ? parseInt(reviewCountMatch[1], 10)
          : undefined;

        // Extract category from nearby elements
        const categoryEl = element.querySelector(
          '[class*="category"], [class*="snippet"]'
        );
        const category = categoryEl?.textContent?.trim();

        // Extract phone number - look for tel: links or phone patterns
        const phoneEl = element.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null;
        const phone = phoneEl?.href?.replace('tel:', '')?.trim() ||
                      element.textContent?.match(/(\+?\d[\d\s-]{7,}\d)/)?.[0]?.trim();

        // Extract website - look for website icon or http links
        const websiteEl = element.querySelector('a[href*="yelp.com/biz"]') as HTMLAnchorElement | null;
        const website = websiteEl?.href?.trim();

        results.push({
          name,
          address,
          phone: phone || undefined,
          website: website || undefined,
          category,
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
      source: "yelp" as ScraperSource,
    }));
  }

  /**
   * Navigate to the next page of results
   */
  private async goToNextPage(page: Page, currentPage: number): Promise<boolean> {
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
