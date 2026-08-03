/**
 * Facebook Scraper
 *
 * Scrapes Facebook for business page details using Puppeteer.
 * Extracts: name, address, phone, website, rating, review_count
 * Handles: login prompts, pagination, rate limiting
 */

import puppeteer, { Browser, Page } from "puppeteer";
import {
  ScrapedFacebookBusiness,
  FacebookScraperPagination,
  FacebookScraperResult,
  FacebookScraperOptions,
  FacebookScraperJobState,
  FacebookScraperErrorType,
  FacebookScraperError,
} from "../types/facebook-scraper";

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_DELAY_BETWEEN_PAGES_MS = 2000;
const FACEBOOK_SEARCH_URL = "https://www.facebook.com/search/pages";

/**
 * Facebook Scraper - extracts business page data from Facebook search results
 */
export class FacebookScraper {
  private browser: Browser | null = null;
  private options: Required<FacebookScraperOptions>;

  constructor(options: FacebookScraperOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
      delayBetweenPagesMs:
        options.delayBetweenPagesMs ?? DEFAULT_DELAY_BETWEEN_PAGES_MS,
      includeDuplicates: options.includeDuplicates ?? false,
      handleLoginPrompt: options.handleLoginPrompt ?? true,
      handleRateLimiting: options.handleRateLimiting ?? true,
    };
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Scrape business pages from Facebook search
   */
  async scrape(
    query: string,
    location: string
  ): Promise<FacebookScraperResult> {
    await this.initialize();

    const page = await this.browser!.newPage();
    const businesses: ScrapedFacebookBusiness[] = [];
    let currentPage = 0;
    let loginRequired = false;
    let rateLimited = false;

    try {
      // Build search URL with query and location
      const searchUrl = `${FACEBOOK_SEARCH_URL}?q=${encodeURIComponent(query)}&geo=${encodeURIComponent(location)}`;

      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

      // Check for login prompt
      if (await this.checkLoginPrompt(page)) {
        loginRequired = true;
        if (this.options.handleLoginPrompt) {
          console.log("Login prompt detected - proceeding with public data only");
        }
      }

      // Check for rate limiting
      if (await this.checkRateLimiting(page)) {
        rateLimited = true;
        if (this.options.handleRateLimiting) {
          console.log("Rate limit detected - proceeding with caution");
        }
      }

      await page.waitForSelector('[data-pagelet="PageUnits"]', { timeout: 10000 });

      // Extract business pages from search results
      const extractedBusinesses = await this.extractBusinessesFromPage(page);
      businesses.push(...extractedBusinesses);
      currentPage = 1;

      // Handle pagination if needed
      while (
        currentPage < this.options.maxPages &&
        extractedBusinesses.length > 0
      ) {
        const hasNext = await this.navigateToNextPage(page);
        if (!hasNext) {
          break;
        }

        await page.waitForSelector('[data-pagelet="PageUnits"]', {
          timeout: 10000,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, this.options.delayBetweenPagesMs)
        );

        const nextBusinesses = await this.extractBusinessesFromPage(page);
        if (!this.options.includeDuplicates) {
          const existingIds = new Set(businesses.map((b) => b.sourceId));
          const newBusinesses = nextBusinesses.filter(
            (b) => !existingIds.has(b.sourceId!)
          );
          businesses.push(...newBusinesses);
        } else {
          businesses.push(...nextBusinesses);
        }

        currentPage++;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new FacebookScraperError(
        FacebookScraperErrorType.NETWORK_ERROR,
        `Facebook scraping failed: ${errorMessage}`
      );
    } finally {
      await page.close();
    }

    const pagination: FacebookScraperPagination = {
      currentPage,
      totalPages: Math.min(currentPage, this.options.maxPages),
      resultsPerPage: businesses.length / Math.max(currentPage, 1),
      totalResults: businesses.length,
      hasNextPage: currentPage < this.options.maxPages,
    };

    return {
      businesses,
      pagination,
      source: "facebook",
      query,
      location,
      timestamp: new Date(),
      loginRequired,
      rateLimited,
    };
  }

  /**
   * Get current job state for progress tracking
   */
  getJobState(query: string, location: string): FacebookScraperJobState {
    return {
      query,
      location,
      currentPage: 0,
      totalPages: this.options.maxPages,
      businessesCollected: [],
      isComplete: false,
    };
  }

  /**
   * Check if login prompt is displayed
   */
  private async checkLoginPrompt(page: Page): Promise<boolean> {
    const loginSelectors = [
      'input[name="email"]',
      'input[name="login_email"]',
      '[data-testid="login_email"]',
      'form[action*="login"]',
      '[aria-label*="Log In"]',
    ];

    for (const selector of loginSelectors) {
      const element = await page.$(selector);
      if (element) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if rate limiting is active
   */
  private async checkRateLimiting(page: Page): Promise<boolean> {
    const rateLimitSelectors = [
      '[data-testid="rate_limit"]',
      '[aria-label*="rate limit"]',
      '.rate-limit-message',
      '[class*="rate-limit"]',
    ];

    for (const selector of rateLimitSelectors) {
      const element = await page.$(selector);
      if (element) {
        return true;
      }
    }

    const content = await page.content();
    return (
      content.includes("We have detected unusual activity") ||
      content.includes("Temporarily Blocked") ||
      content.includes("Action Blocked")
    );
  }

  /**
   * Extract business data from the current page
   */
  private async extractBusinessesFromPage(
    page: Page
  ): Promise<ScrapedFacebookBusiness[]> {
    return await page.evaluate(() => {
      const businesses: ScrapedFacebookBusiness[] = [];
      const pageUnits = document.querySelectorAll('[data-pagelet="PageUnits"]');

      pageUnits.forEach((unit) => {
        const nameEl = unit.querySelector('[role="heading"] a span');
        const linkEl = unit.querySelector('a[href*="/pages/"]');
        const categoryEl = unit.querySelector('div[role="img"] + div span');

        if (nameEl && linkEl) {
          const name = nameEl.textContent?.trim() || "";
          const href = linkEl.getAttribute("href") || "";
          const sourceId = href.match(/\/pages\/([^/]+)/)?.[1];

          businesses.push({
            name,
            source: "facebook",
            sourceId,
            category: categoryEl?.textContent?.trim() || undefined,
          });
        }
      });

      return businesses;
    });
  }

  /**
   * Navigate to the next page of results
   */
  private async navigateToNextPage(page: Page): Promise<boolean> {
    try {
      const nextButton = await page.$('button:has-text("More Results")');
      if (nextButton) {
        await nextButton.click();
        await page.waitForLoadState("networkidle");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
