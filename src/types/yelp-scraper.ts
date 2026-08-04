/**
 * Yelp Scraper Types
 *
 * Types for the Yelp web scraper that extracts business data.
 */

/**
 * Scraped business data from Yelp
 */
export interface ScrapedBusiness {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  source: "yelp";
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
  source: "yelp";
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
