/**
 * Scraped Business Types
 *
 * Defines data structures for businesses scraped from external sources.
 */

import { ScraperSource } from "./scrape-job";

/**
 * Status for a scraped business
 */
export type ScrapedBusinessStatus = "pending_review" | "approved" | "rejected";

/**
 * ScrapedBusiness entity stored in PostgreSQL
 */
export interface ScrapedBusiness {
  id: string;
  scrapeJobId: string;
  source: ScraperSource;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  status: ScrapedBusinessStatus;
  createdAt: Date;
  updatedAt: Date;
}

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
 * Validates scraped business input
 */
export function validateScrapedBusinessInput(input: CreateScrapedBusinessInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.scrapeJobId || input.scrapeJobId.trim() === "") {
    errors.push("Scrape job ID is required");
  }

  if (!input.source || input.source.trim() === "") {
    errors.push("Source is required");
  }

  if (!input.name || input.name.trim() === "") {
    errors.push("Business name is required");
  }

  if (!input.address || input.address.trim() === "") {
    errors.push("Address is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
