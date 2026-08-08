/**
 * Google Maps Scraper Types
 */

export interface ScrapedBusiness {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  source: "google-maps";
  [key: string]: unknown;
}

export interface ScraperResult {
  businesses: ScrapedBusiness[];
  pagination: {
    currentPage: number;
    totalPages: number;
    resultsPerPage: number;
    totalResults: number;
    hasNextPage: boolean;
  };
  source: "google-maps";
  query?: string;
  location?: string;
  timestamp?: Date;
}

export interface ScraperOptions {
  maxPages?: number;
  delayBetweenPagesMs?: number;
  includeDuplicates?: boolean;
  headless?: boolean;
  credentials?: {
    email: string;
    password: string;
  };
}

export interface ScraperJobState {
  query: string;
  location: string;
  currentPage: number;
  totalPages: number;
  businessesCollected: ScrapedBusiness[];
  isComplete: boolean;
  error?: string;
}
