/**
 * Yelp Scraper Types
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
  source: "yelp";
  query?: string;
  location?: string;
  timestamp?: Date;
}

export interface ScraperOptions {
  maxPages?: number;
  delayBetweenPagesMs?: number;
  includeDuplicates?: boolean;
  headless?: boolean;
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
