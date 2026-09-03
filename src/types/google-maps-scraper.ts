/**
 * Google Maps Scraper Types
 *
 * Types for the Google Maps web scraper that extracts business data.
 */

import {
  ScrapedBusiness,
  ScraperPagination,
  ScraperOptions,
  ScraperJobState,
} from "./scraper-result";

export type { ScrapedBusiness, ScraperPagination, ScraperOptions, ScraperJobState };

/**
 * Detailed place information from Google Maps
 */
export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  categories?: string[];
  hours?: string;
  priceLevel?: string;
  status?: "open" | "closed" | "unknown";
  images?: string[];
  source: "google-maps";
  scrapedAt: string;
}
