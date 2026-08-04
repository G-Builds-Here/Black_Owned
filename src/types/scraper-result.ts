/**
 * Unified Scraper Result Type
 *
 * Raw scraped data before normalization.
 * Holds source-specific fields for GoogleMaps, Yelp, Facebook.
 */

import { ScraperSource } from "./scrape-job";

/**
 * Raw scraped business data (before normalization)
 * Contains source-specific fields that will be transformed during ETL
 */
export interface RawScrapedBusiness {
  // Common fields across all sources
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  sourceId?: string;

  // Source-specific fields
  category?: string; // Yelp, Facebook
  imageUrl?: string; // Google Maps
  description?: string; // Google Maps
  tags?: string[]; // Google Maps
  hours?: string; // Facebook
  priceRange?: string; // Yelp
}

/**
 * Scraper pagination metadata
 */
export interface ScraperPagination {
  currentPage: number;
  totalPages: number;
  resultsPerPage: number;
  totalResults: number;
  hasNextPage: boolean;
}

/**
 * Unified ScraperResult - raw scraped data before normalization
 *
 * This struct holds the raw data as scraped from external sources
 * before it goes through the ETL pipeline for normalization.
 */
export interface ScraperResult {
  // Raw scraped business data
  businesses: RawScrapedBusiness[];

  // Pagination metadata
  pagination: ScraperPagination;

  // Source identifier
  source: ScraperSource;

  // Search parameters
  query: string;
  location: string;

  // Timestamp of scrape
  timestamp: Date;

  // Optional: raw HTML/response data for debugging
  rawResponse?: string;

  // Optional: scrape metadata
  scrapeMetadata?: {
    durationMs: number;
    userAgent: string;
    proxyUsed?: string;
  };
}

/**
 * Scraper options
 */
export interface ScraperOptions {
  maxPages?: number;
  delayBetweenPagesMs?: number;
  includeDuplicates?: boolean;
  proxyUrl?: string;
  userAgent?: string;
}

/**
 * Scraper job state for tracking progress
 */
export interface ScraperJobState {
  query: string;
  location: string;
  currentPage: number;
  totalPages: number;
  businessesCollected: RawScrapedBusiness[];
  isComplete: boolean;
  error?: string;
}
