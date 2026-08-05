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
  category?: string;
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
