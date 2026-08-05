/**
 * Google Maps Scraper Service
 *
 * Web scraper for extracting business data from Google Maps using Playwright.
 * Handles pagination to capture all results when more than 10 exist.
 * Supports login authentication for accessing protected content.
 */

import { Browser, Page, BrowserContext } from "playwright";
import {
  ScrapedBusiness,
  ScraperResult,
  ScraperOptions,
  ScraperJobState,
} from "../types/google-maps-scraper";
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
      credentials: options.credentials ?? undefined,
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
   * Check if a login prompt is detected on the page
   */
  private async detectLoginPrompt(page: Page): Promise<boolean> {
    try {
      const hasLoginPrompt = await page.evaluate(() => {
        const loginSelectors = [
          'a[href*="login"]',
          'a[href*="signin"]',
          '[class*="login"]',
          '[class*="signin"]',
          '[class*="sign-in"]',
          '[class*="auth"]',
          '[data-testid*="login"]',
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'button:has-text("Sign In")',
          'button:has-text("Log In")',
        ];

        for (const selector of loginSelectors) {
          if (document.querySelector(selector)) {
            return true;
          }
        }
        return false;
      });

      return hasLoginPrompt;
    } catch {
      return false;
    }
  }

  /**
   * Perform login with configured credentials
   */
  private async performLogin(page: Page): Promise<boolean> {
    if (!this.options.credentials) {
      return false;
    }

    try {
      console.log("Attempting to log in to Google Maps...");

      // Navigate to Google login page
      await page.goto("https://accounts.google.com/signin", {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for email input
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });

      // Enter email
      await page.fill('input[type="email"]', this.options.credentials.email);
      await page.click('button:has-text("Next")');

      // Wait for password input
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });

      // Enter password
      await page.fill('input[type="password"]', this.options.credentials.password);
      await page.click('button:has-text("Next")');

      // Wait for navigation or timeout
      try {
        await page.waitForNavigation({ timeout: 15000 });
        console.log("Login successful");
        return true;
      } catch {
        // Check if we're still on login page
        const stillOnLogin = await page.evaluate(() => {
          return !!document.querySelector('input[type="password"]');
        });

        if (!stillOnLogin) {
          console.log("Login successful (navigation detected)");
          return true;
        }

        console.log("Login may require additional steps (2FA, etc.)");
        return false;
      }
    } catch (error) {
      console.log("Login failed or not required:", error);
      return false;
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
          category?: string;
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
          const categoryEl = element.querySelector(
            '[class*="category"], [data-testid="place-category"], .business-category, span:has-text("restaurant"):not([class*="title"])'
          );

          if (nameEl && addressEl) {
            const name = nameEl.textContent?.trim() || "";
            const address = addressEl.textContent?.trim() || "";

            // Parse rating from text (e.g., "4.5 ★★★★★")
            let rating: number | undefined;
            if (ratingEl) {
              const ratingText = ratingEl.textContent || ratingEl.getAttribute("aria-label") || "";
              const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
              if (ratingMatch) {
                rating = parseFloat(ratingMatch[1]);
              }
            }

            // Parse review count (e.g., "(1,234) reviews" or "1,234 reviews")
            let reviewCount: number | undefined;
            if (reviewsEl) {
              const reviewsText = reviewsEl.textContent || "";
              const reviewMatch = reviewsText.match(/(\d{1,3}(?:,\d{3})*)/);
              if (reviewMatch) {
                reviewCount = parseInt(reviewMatch[1].replace(/,/g, ""), 10);
              }
            }

            results.push({
              name,
              address,
              phone: phoneEl?.textContent?.trim(),
              website: websiteEl?.getAttribute("href"),
              rating,
              reviewCount,
              category: categoryEl?.textContent?.trim(),
            });
          }
        }

        return results;
      });

      // Filter duplicates and build ScrapedBusiness objects
      const filteredBusinesses: ScrapedBusiness[] = [];
      for (const business of businesses) {
        if (!this.options.includeDuplicates && seenNames.has(business.name)) {
          continue;
        }
        seenNames.add(business.name);
        filteredBusinesses.push({
          ...business,
          source: "google-maps",
        });
      }

      return filteredBusinesses;
    } catch (error) {
      console.error("Error extracting businesses from page:", error);
      return [];
    }
  }

  /**
   * Parse rating from text
   */
  private parseRating(text: string): number | undefined {
    if (!text) return undefined;
    const match = text.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : undefined;
  }

  /**
   * Parse review count from text
   */
  private parseReviewCount(text: string): number | undefined {
    if (!text) return undefined;
    const match = text.match(/(\d{1,3}(?:,\d{3})*)/);
    return match ? parseInt(match[1].replace(/,/g, ""), 10) : undefined;
  }

  /**
   * Navigate to the next page of results
   */
  private async goToNextPage(page: Page, currentPage: number): Promise<boolean> {
    try {
      // Wait a moment for page to stabilize
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Try multiple selector patterns for the "Next" button
      const nextButton = await page.$(
        'button[aria-label*="Next"], button[aria-label*="Next"], a[aria-label*="Next"], [aria-label*="Next"], .next-button, .pagination-next, [data-testid="pagination-next"]'
      );

      if (!nextButton) {
        return false;
      }

      // Check if button is disabled
      const isDisabled = await page.evaluate((btn) => {
        return btn.hasAttribute("disabled") || btn.getAttribute("aria-disabled") === "true";
      }, nextButton);

      if (isDisabled) {
        return false;
      }

      // Click the next button
      await nextButton.click();

      // Wait for page to load
      try {
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } catch {
        // Continue even if timeout
      }

      return true;
    } catch (error) {
      console.log("No more pages or error navigating:", error);
      return false;
    }
  }

  /**
   * Get the current state of the scraper job
   */
  getJobState(): ScraperJobState | null {
    return null; // Placeholder - would track actual state in a real implementation
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
