/**
 * Scraped Business Types
 *
 * Data model for businesses scraped from external sources.
 */

import { ScraperSource } from "./scraper-result";

/**
 * Input for creating a scraped business record
 */
export interface CreateScrapedBusinessInput {
  scrapeJobId: string;
  source: ScraperSource;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
}

/**
 * Scraped business entity
 */
export interface ScrapedBusiness extends CreateScrapedBusinessInput {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
