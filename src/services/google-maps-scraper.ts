/**
 * Google Maps Scraper Service
 * Scrapes business data from Google Maps search results
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface ScrapedBusiness {
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  location: string;
  imageUrl: string;
  description: string;
  tags: string[];
}

export interface ScraperConfig {
  headless?: boolean;
  timeoutMs?: number;
  maxResults?: number;
}

export interface SearchParams {
  query: string;
  location?: string;
}

class GoogleMapsScraper {
  private browser: Browser | null = null;
  private config: Required<ScraperConfig>;

  constructor(config?: ScraperConfig) {
    this.config = {
      headless: config?.headless ?? true,
      timeoutMs: config?.timeoutMs ?? 60000,
      maxResults: config?.maxResults ?? 20,
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
   * Search for businesses on Google Maps
   */
  async searchBusinesses(params: SearchParams): Promise<ScrapedBusiness[]> {
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    try {
      // Build search URL
      const searchQuery = params.location
        ? `${params.query} in ${params.location}`
        : params.query;

      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

      // Navigate to Google Maps search
      await page.goto(searchUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.timeoutMs,
      });

      // Wait for results to load
      await page.waitForSelector('[role="main"]', { timeout: 30000 }).catch(() => {
        // Continue even if selector not found - results may still load
      });

      // Wait a moment for dynamic content
      await page.waitForTimeout(2000);

      // Extract business cards from the results
      const businesses = await this.extractBusinesses(page);

      return businesses.slice(0, this.config.maxResults);
    } catch (error) {
      console.error('Error scraping Google Maps:', error);
      throw error;
    } finally {
      await page.close();
      await context.close();
    }
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

    return {
      name,
      category: category || 'Business',
      rating,
      reviewCount,
      location: location || 'Location not available',
      imageUrl: '',
      description: '',
      tags: [],
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

      await page.goto(searchUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.timeoutMs,
      });

      await page.waitForTimeout(2000);

      // Click on the first result to get details
      const firstResult = await page.$('[data-item-id]');
      if (firstResult) {
        await firstResult.click();
        await page.waitForTimeout(2000);

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

// Singleton instance
let scraperInstance: GoogleMapsScraper | null = null;

export function getGoogleMapsScraper(config?: ScraperConfig): GoogleMapsScraper {
  if (!scraperInstance) {
    scraperInstance = new GoogleMapsScraper(config);
  }
  return scraperInstance;
}

export { GoogleMapsScraper };
