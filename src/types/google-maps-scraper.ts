/**
 * Google Maps Scraper Types
 *
 * Types for the Google Maps web scraper that extracts business data.
 */

/**
 * Scraped business data from Google Maps
 */
export interface ScrapedBusiness {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  source: "google-maps";
  sourceId?: string;
}

/**
 * Scraper pagination info
 */
export interface ScraperPagination {
  currentPage: number;
  totalPages: number;
  resultsPerPage: number;
  totalResults: number;
  hasNextPage: boolean;
}

/**
 * Scraper result with pagination metadata
 */
export interface ScraperResult {
  businesses: ScrapedBusiness[];
  pagination: ScraperPagination;
  source: "google-maps";
  query: string;
  location: string;
  timestamp: Date;
}

/**
 * Scraper options
 */
export interface ScraperOptions {
  maxPages?: number;
  delayBetweenPagesMs?: number;
  includeDuplicates?: boolean;
}

/**
 * Scraper job state for tracking progress
 */
export interface ScraperJobState {
  query: string;
  location: string;
  currentPage: number;
  totalPages: number;
  businessesCollected: ScrapedBusiness[];
  isComplete: boolean;
  error?: string;
}

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
