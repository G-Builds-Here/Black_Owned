/**
 * Business Scraper Factory
 *
 * Factory function to select the appropriate scraper based on source.
 */

import { GoogleMapsScraper } from "./google-maps-scraper";
import { YelpScraper } from "./yelp-scraper";
import { FacebookScraper } from "./facebook-scraper";
import { ScraperSource } from "../types/scraper-result";

/**
 * Scraper interface - all scrapers implement this
 */
export interface Scraper {
  source: ScraperSource;
  scrape(query: string, location: string): Promise<unknown>;
}

/**
 * Get a scraper instance by source type
 * @param source - The scraper source (GOOGLE_MAPS, YELP, FACEBOOK)
 * @returns Scraper instance
 */
export function getScraper(source: ScraperSource): Scraper {
  switch (source) {
    case ScraperSource.GOOGLE_MAPS:
      return new GoogleMapsScraper();
    case ScraperSource.YELP:
      return new YelpScraper();
    case ScraperSource.FACEBOOK:
      return new FacebookScraper();
    default:
      throw new Error(`Unknown scraper source: ${source}`);
  }
}

/**
 * Get all available scraper sources
 * @returns Array of supported scraper sources
 */
export function getAvailableSources(): ScraperSource[] {
  return [ScraperSource.GOOGLE_MAPS, ScraperSource.YELP, ScraperSource.FACEBOOK];
}
