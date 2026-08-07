/**
 * Business Metadata Types
 *
 * Types for extracted business metadata from scraper sources.
 */

/**
 * Extracted business metadata from a scraper source
 */
export interface BusinessMetadata {
  /** Business name */
  name: string;
  /** Business category */
  category: string;
  /** Rating on a 1-5 star scale */
  rating: number;
  /** Number of reviews */
  reviewCount: number;
  /** Optional: business address */
  address?: string;
  /** Optional: business phone */
  phone?: string;
  /** Optional: business website */
  website?: string;
}

/**
 * Input data from a scraper source to be normalized into BusinessMetadata
 */
export interface ScraperRawData {
  /** Raw name from scraper */
  name: string;
  /** Raw category from scraper */
  category: string;
  /** Raw rating (may be string like "4.5" or number) */
  rating: string | number;
  /** Raw review count (may contain formatting like "1.2K" or "500+") */
  reviewCount: string | number;
  /** Optional: address from scraper */
  address?: string;
  /** Optional: phone from scraper */
  phone?: string;
  /** Optional: website from scraper */
  website?: string;
}

/**
 * Normalization result with validation status
 */
export interface NormalizationResult {
  success: boolean;
  metadata?: BusinessMetadata;
  errors: string[];
}
