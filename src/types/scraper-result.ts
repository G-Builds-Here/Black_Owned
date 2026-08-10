/**
 * Scraper Result Types
 *
 * Defines data structures for Google Maps and Yelp scraper results.
 */

/**
 * Source platform for scraped business data
 */
export type ScraperSource = "google_maps" | "yelp";

/**
 * Result from a Google Maps or Yelp scrape
 */
export interface ScraperResult {
  source: ScraperSource;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  location?: {
    lat: number;
    lng: number;
  };
}
