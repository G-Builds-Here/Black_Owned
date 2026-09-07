/**
 * Facebook Scraper
 *
 * Scrapes Facebook for business page search results.
 */

import { Browser, Page, BrowserContext } from "playwright";
import {
  ScrapedBusiness,
  ScraperResult,
  ScraperOptions,
  ScraperJobState,
  ScraperPagination,
  ScraperSource,
} from "../types/scraper-result";

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_DELAY_BETWEEN_PAGES_MS = 2000;
const FACEBOOK_SEARCH_URL = "https://www.facebook.com/search/pages";
const FACEBOOK_LOGIN_URL = "https://www.facebook.com/login";

/**
 * Facebook Scraper - extracts business page data from Facebook search results
 */
export class FacebookScraper {
  source: ScraperSource = ScraperSource.FACEBOOK;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: Required<Omit<ScraperOptions, "credentials">>;
  private credentials?: { email: string; password: string };

  constructor(options: ScraperOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
      delayBetweenPagesMs:
        options.delayBetweenPagesMs ?? DEFAULT_DELAY_BETWEEN_PAGES_MS,
      includeDuplicates: options.includeDuplicates ?? false,
    };
    this.credentials = options.credentials;
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
   * Detect whether the current page is showing a Facebook login wall.
   */
  private async detectLoginPrompt(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const loginSelectors = [
          'input[name="email"]',
          'input[name="pass"]',
          "#email",
          "#pass",
          "#login_form",
          '[data-pagelet="LoginForm"]',
          'a[href*="login"]',
          'button:has-text("Log In")',
          'input[type="submit"][value="Log In"]',
          '[class*="login"]',
          '[class*="signin"]',
        ];

        for (const selector of loginSelectors) {
          if (document.querySelector(selector)) {
            return true;
          }
        }
        return false;
      });
    } catch {
      return false;
    }
  }

  /**
   * Log in to Facebook with the configured credentials, if any.
   *
   * Returns true when the login form is left (navigation away or the password
   * field disappearing); false when credentials are missing or the login could
   * not complete (a 2FA challenge or wrong credentials keeps the password
   * field on screen).
   */
  private async performLogin(page: Page): Promise<boolean> {
    if (!this.credentials) {
      return false;
    }

    try {
      console.log("Attempting to log in to Facebook...");

      await page.goto(FACEBOOK_LOGIN_URL, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Facebook's login form shows the email and password fields together.
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.fill('input[name="email"]', this.credentials.email);

      await page.waitForSelector('input[name="pass"]', { timeout: 10000 });
      await page.fill('input[name="pass"]', this.credentials.password);

      await page.click('input[type="submit"][value="Log In"]');

      try {
        await page.waitForNavigation({ timeout: 15000 });
        console.log("Facebook login successful");
        return true;
      } catch {
        const stillOnLogin = await page.evaluate(
          () => !!document.querySelector('input[name="pass"]')
        );
        if (!stillOnLogin) {
          console.log("Facebook login successful (navigation detected)");
          return true;
        }
        console.log("Facebook login may require additional steps (2FA, etc.)");
        return false;
      }
    } catch (error) {
      console.log("Facebook login failed or not required:", error);
      return false;
    }
  }

  /**
   * Scrape business pages from Facebook search
   */
  async scrape(
    query: string,
    location: string
  ): Promise<ScraperResult> {
    await this.initialize();

    const page = await this.context!.newPage();
    const businesses: ScrapedBusiness[] = [];
    let currentPage = 0;

    try {
      // Build search URL with query and location
      const searchUrl = `${FACEBOOK_SEARCH_URL}?q=${encodeURIComponent(query)}&geo=${encodeURIComponent(location)}`;

      await page.goto(searchUrl, { waitUntil: "networkidle" });

      // Facebook gates search results behind a login wall. If the wall shows
      // and credentials are configured, log in and re-run the search so the
      // results are visible.
      const loginPromptDetected = await this.detectLoginPrompt(page);
      if (loginPromptDetected && this.credentials) {
        const loginSuccessful = await this.performLogin(page);
        if (loginSuccessful) {
          await page.goto(searchUrl, { waitUntil: "networkidle" });
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
      throw new Error(`Facebook scraping failed: ${errorMessage}`);
    } finally {
      await page.close();
    }

    const pagination: ScraperPagination = {
      currentPage,
      totalPages: Math.min(currentPage, this.options.maxPages),
      resultsPerPage: businesses.length / currentPage,
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
    };
  }

  /**
   * Get current job state for progress tracking
   */
  getJobState(query: string, location: string): ScraperJobState {
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
   * Extract business data from the current page
   */
  private async extractBusinessesFromPage(
    page: Page
  ): Promise<ScrapedBusiness[]> {
    return await page.evaluate(() => {
      const businesses: ScrapedBusiness[] = [];
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
            address: "",
            source: ScraperSource.FACEBOOK,
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
