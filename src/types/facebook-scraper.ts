/**
 * Facebook Scraper Types
 *
 * Types for the Facebook web scraper that extracts business page data.
 */

/**
 * Scraped business data from Facebook
 */
export interface ScrapedFacebookBusiness {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  source: "facebook";
  sourceId?: string;
}

/**
 * Scraper pagination info
 */
export interface FacebookScraperPagination {
  currentPage: number;
  totalPages: number;
  resultsPerPage: number;
  totalResults: number;
  hasNextPage: boolean;
}

/**
 * Scraper result with pagination metadata
 */
export interface FacebookScraperResult {
  businesses: ScrapedFacebookBusiness[];
  pagination: FacebookScraperPagination;
  source: "facebook";
  query: string;
  timestamp: Date;
  loginRequired?: boolean;
  rateLimited?: boolean;
}

/**
 * Scraper options
 */
export interface FacebookScraperOptions {
  maxPages?: number;
  delayBetweenPagesMs?: number;
  includeDuplicates?: boolean;
  handleLoginPrompt?: boolean;
  handleRateLimiting?: boolean;
}

/**
 * Scraper job state for tracking progress
 */
export interface FacebookScraperJobState {
  query: string;
  currentPage: number;
  totalPages: number;
  businessesCollected: ScrapedFacebookBusiness[];
  isComplete: boolean;
  loginRequired?: boolean;
  rateLimited?: boolean;
  error?: string;
}

/**
 * Scraper error types
 */
export enum FacebookScraperErrorType {
  PAGE_NOT_FOUND = "PAGE_NOT_FOUND",
  LOGIN_REQUIRED = "LOGIN_REQUIRED",
  RATE_LIMITED = "RATE_LIMITED",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN",
}

/**
 * Scraper error with type information
 */
export class FacebookScraperError extends Error {
  constructor(
    public readonly type: FacebookScraperErrorType,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FacebookScraperError";
  }
}
