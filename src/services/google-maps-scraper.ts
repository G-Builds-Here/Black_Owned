/**
 * Google Maps Scraper Service
 * Scrapes business data from Google Maps search results with pagination support
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { checkUrlAllowed, type RobotsCheckResult } from '@/lib/scraper/robots-service';
import { withRetry, RetryError, type RetryConfig, retryPageNavigation, retryDataExtraction } from '@/lib/scraper/scraper-retry';

export interface ScrapedBusiness {
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  location: string;
  imageUrl: string;
  description: string;
  tags: string[];
  phone?: string;
  website?: string;
}

export interface ScraperConfig {
  headless?: boolean;
  timeoutMs?: number;
  maxResults?: number;
  maxPages?: number;
}

export interface SearchParams {
  query: string;
  location?: string;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  hasNextPage: boolean;
}

export interface ScraperResult {
  businesses: ScrapedBusiness[];
  pagination: PaginationInfo;
  source: 'google-maps';
  query: string;
  location?: string;
  timestamp: Date;
}

class GoogleMapsScraper {
  private browser: Browser | null = null;
  private config: Required<ScraperConfig>;

  constructor(config?: ScraperConfig) {
    this.config = {
      headless: config?.headless ?? true,
      timeoutMs: config?.timeoutMs ?? 60000,
      maxResults: config?.maxResults ?? 20,
      maxPages: config?.maxPages ?? 5,
    };
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });
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
   * Check robots.txt before scraping
   */
  async checkRobotsBeforeScraping(): Promise<RobotsCheckResult> {
    const googleBaseUrl = 'https://www.google.com';
    const searchPath = '/maps/search/';
    return checkUrlAllowed(`${googleBaseUrl}${searchPath}`, 'BlackOwnedScraper/1.0');
  }

  /**
   * Search for businesses on Google Maps
   * @deprecated Use scrape() instead for pagination support
   */
  async searchBusinesses(params: SearchParams): Promise<ScrapedBusiness[]> {
    const result = await this.scrape(params.query, params.location);
    return result.businesses;
  }

  /**
   * Scrape businesses from Google Maps with pagination support
   * Handles multiple pages to capture all results when more than 10 exist
   */
  async scrape(
    query: string,
    location?: string,
  ): Promise<ScraperResult> {
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    // Check robots.txt before proceeding
    const robotsCheck = await this.checkRobotsBeforeScraping();
    if (!robotsCheck.allowed) {
      console.warn(`Scraping blocked by robots.txt: ${robotsCheck.reason}`);
      return {
        businesses: [],
        pagination: {
          currentPage: 0,
          totalPages: 0,
          totalResults: 0,
          hasNextPage: false,
        },
        source: 'google-maps',
        query,
        location,
        timestamp: new Date(),
      };
    }

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    try {
      // Build search URL
      const searchQuery = location ? `${query} in ${location}` : query;
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

      // Navigate to Google Maps search with retry logic
      await retryPageNavigation(async () => {
        await page.goto(searchUrl, {
          waitUntil: 'networkidle',
          timeout: this.config.timeoutMs,
        });
      }, 2);

      // Wait for results to load with retry
      await retryDataExtraction(async () => {
        await page.waitForSelector('[role="main"]', { timeout: 30000 }).catch(() => {
          // Continue even if selector not found - results may still load
        });
      }, 2);

      // Wait a moment for dynamic content
      await page.waitForTimeout(2000);

      // Scrape with pagination
      const result = await this.scrapeWithPagination(page, query, location);
      return result;
    } catch (error) {
      console.error('Error scraping Google Maps:', error);
      throw error;
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * Scrape businesses with pagination support
   * Handles multiple pages to capture all results when more than 10 exist
   */
  private async scrapeWithPagination(
    page: Page,
    query: string,
    location?: string,
  ): Promise<ScraperResult> {
    const allBusinesses: ScrapedBusiness[] = [];
    const seenNames: Set<string> = new Set();
    let currentPage = 0;
    const maxPages = this.config.maxPages;

    while (currentPage < maxPages) {
      // Extract businesses from current page
      const pageBusinesses = await this.extractBusinesses(page);

      // Add unique businesses
      for (const business of pageBusinesses) {
        if (!seenNames.has(business.name)) {
          seenNames.add(business.name);
          allBusinesses.push(business);
        }
      }

      // Check if we've reached the max results limit
      if (allBusinesses.length >= this.config.maxResults) {
        break;
      }

      // Try to find and click the "Next" button
      const nextButton = await page.$('button[aria-label*="Next"], button:has-text("Next"), button:has-text("next")');

      if (!nextButton) {
        // No more pages available
        break;
      }

      // Check if the next button is disabled
      const isDisabled = await nextButton.isDisabled();
      if (isDisabled) {
        // No more pages available
        break;
      }

      // Click the next button to go to the next page with retry logic
      await retryPageNavigation(async () => {
        await nextButton.click();
        await page.waitForLoadState('networkidle');
      }, 2);
      await page.waitForTimeout(2000);

      currentPage++;
    }

    // Apply maxResults limit
    const limitedBusinesses = allBusinesses.slice(0, this.config.maxResults);

    // Calculate pagination info
    const hasNextPage = currentPage >= maxPages && limitedBusinesses.length >= this.config.maxResults;

    return {
      businesses: limitedBusinesses,
      pagination: {
        currentPage: currentPage + 1, // 1-indexed
        totalPages: currentPage + 1,
        totalResults: limitedBusinesses.length,
        hasNextPage,
      },
      source: 'google-maps',
      query,
      location,
      timestamp: new Date(),
    };
  }

  /**
   * Extract business data from the page
   */
  private async extractBusinesses(page: Page): Promise<ScrapedBusiness[]> {
    return page.evaluate(() => {
      const businesses: ScrapedBusiness[] = [];

      // Try multiple selectors for business cards
      const selectors = [
        '[data-item-id]',
        '[role="article"]',
        'div[role="main"] > div:first-child > div',
        'div[jsaction]',
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);

        for (const el of Array.from(elements)) {
          const business = this.extractBusinessFromElement(el as HTMLElement);
          if (business && business.name) {
            // Avoid duplicates
            if (!businesses.some((b) => b.name === business.name)) {
              businesses.push(business);
            }
          }
        }

        if (businesses.length > 0) {
          break;
        }
      }

      return businesses;
    });
  }

  /**
   * Extract business data from a single element
   */
  private extractBusinessFromElement(el: HTMLElement): ScrapedBusiness | null {
    // Extract name
    const nameEl = el.querySelector('h3, [role="heading"]') as HTMLElement | null;
    const name = nameEl?.textContent?.trim();

    if (!name) {
      return null;
    }

    // Extract category
    const categoryEl = el.querySelector('button, [aria-label]') as HTMLElement | null;
    const category = categoryEl?.getAttribute('aria-label')?.split(',')[1]?.trim() || 'Unknown';

    // Extract rating
    const ratingEl = el.querySelector('[aria-label*="star"], [data-star-rating]') as HTMLElement | null;
    const ratingText = ratingEl?.getAttribute('aria-label')?.match(/([\d.]+)\s*star/)?.[1];
    const rating = ratingText ? parseFloat(ratingText) : 0;

    // Extract review count
    const reviewEl = el.querySelector('span') as HTMLElement | null;
    const reviewText = reviewEl?.textContent || '';
    const reviewCountMatch = reviewText.match(/([\d,]+)\s*(?:review|reviews?|ratings?)/i);
    const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, ''), 10) : 0;

    // Extract location (may be in the aria-label or nearby text)
    const location = categoryEl?.getAttribute('aria-label')?.split(',').slice(2).join(',').trim() || '';

    // Extract phone number - look for phone icon or phone number patterns
    const phoneEl = el.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null;
    const phone = phoneEl?.href?.replace('tel:', '')?.trim() ||
                  el.textContent?.match(/(\+?\d[\d\s-]{7,}\d)/)?.[0]?.trim();

    // Extract website - look for website icon or URL patterns
    const websiteEl = el.querySelector('a[href^="http"]') as HTMLAnchorElement | null;
    const website = websiteEl?.href?.trim();

    return {
      name,
      category: category || 'Business',
      rating,
      reviewCount,
      location: location || 'Location not available',
      imageUrl: '',
      description: '',
      tags: [],
      phone: phone || undefined,
      website: website || undefined,
    };
  }

  /**
   * Get detailed information for a specific business
   */
  async getBusinessDetails(searchQuery: string): Promise<ScrapedBusiness | null> {
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    try {
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

      await retryPageNavigation(async () => {
        await page.goto(searchUrl, {
          waitUntil: 'networkidle',
          timeout: this.config.timeoutMs,
        });
      }, 2);

      await retryDataExtraction(async () => {
        await page.waitForTimeout(2000);
      }, 2);

      // Click on the first result to get details
      const firstResult = await page.$('[data-item-id]');
      if (firstResult) {
        await retryPageNavigation(async () => {
          await firstResult.click();
          await page.waitForTimeout(2000);
        }, 2);

        return this.extractBusinessDetails(page);
      }

      return null;
    } catch (error) {
      console.error('Error getting business details:', error);
      return null;
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * Extract detailed business information
   */
  private extractBusinessDetails(page: Page): Promise<ScrapedBusiness | null> {
    return page.evaluate(() => {
      const nameEl = document.querySelector('h1[role="heading"]') as HTMLElement | null;
      const name = nameEl?.textContent?.trim();

      if (!name) {
        return null;
      }

      // Extract category from button with aria-label
      const categoryEl = document.querySelector('button[aria-label*=","]') as HTMLElement | null;
      const category = categoryEl?.getAttribute('aria-label')?.split(',')[1]?.trim() || 'Business';

      // Extract rating
      const ratingEl = document.querySelector('[aria-label*="star"]') as HTMLElement | null;
      const ratingText = ratingEl?.getAttribute('aria-label')?.match(/([\d.]+)\s*star/)?.[1];
      const rating = ratingText ? parseFloat(ratingText) : 0;

      // Extract review count
      const reviewEl = document.querySelector('button[aria-label*="review"]') as HTMLElement | null;
      const reviewText = reviewEl?.getAttribute('aria-label') || '';
      const reviewCountMatch = reviewText.match(/([\d,]+)\s*(?:review|reviews?)/i);
      const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, ''), 10) : 0;

      // Extract address
      const addressEl = document.querySelector('button[aria-label*="Address"]') as HTMLElement | null;
      const location = addressEl?.getAttribute('aria-label')?.split('\n')[1]?.trim() || '';

      return {
        name,
        category,
        rating,
        reviewCount,
        location: location || 'Location not available',
        imageUrl: '',
        description: '',
        tags: [],
      };
    });
  }
}

// Factory function for creating scraper instances (for testing)
export function createGoogleMapsScraper(config?: ScraperConfig): GoogleMapsScraper {
  return new GoogleMapsScraper(config);
}

// Singleton instance
let scraperInstance: GoogleMapsScraper | null = null;

export function getGoogleMapsScraper(config?: ScraperConfig): GoogleMapsScraper {
  if (!scraperInstance) {
    scraperInstance = new GoogleMapsScraper(config);
  }
  return scraperInstance;
}

export { GoogleMapsScraper };
