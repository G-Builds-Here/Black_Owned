/**
 * Duplicate Detection Service
 *
 * Detects potential duplicate businesses using fuzzy matching on name and address.
 * Uses similarity algorithms to calculate scores and flag matches above threshold.
 */

import {
  levenshteinSimilarity,
  normalizeString,
  combinedSimilarity,
} from "../utils/similarity";

/**
 * Configuration for duplicate detection thresholds
 */
export interface DuplicateDetectionConfig {
  /** Minimum similarity score for name match (0-1) */
  nameThreshold: number;
  /** Minimum similarity score for address match (0-1) */
  addressThreshold: number;
  /** Weight for name similarity in combined score */
  nameWeight: number;
  /** Weight for address similarity in combined score */
  addressWeight: number;
}

/**
 * Default configuration for duplicate detection
 */
export const DEFAULT_DUPLICATE_CONFIG: DuplicateDetectionConfig = {
  nameThreshold: 0.8,
  addressThreshold: 0.85,
  nameWeight: 0.6,
  addressWeight: 0.4,
};

/**
 * Result of a duplicate detection check
 */
export interface DuplicateCheckResult {
  /** Whether this is a potential duplicate */
  isPotentialDuplicate: boolean;
  /** Similarity score for the name comparison */
  nameSimilarity: number;
  /** Similarity score for the address comparison */
  addressSimilarity: number;
  /** Combined weighted similarity score */
  combinedScore: number;
  /** Whether name exceeded threshold */
  nameAboveThreshold: boolean;
  /** Whether address exceeded threshold */
  addressAboveThreshold: boolean;
}

/**
 * Business data needed for duplicate detection
 */
export interface BusinessForComparison {
  name: string;
  address: string;
}

/**
 * Checks if two businesses are potential duplicates based on name and address similarity.
 *
 * @param business1 - First business to compare
 * @param business2 - Second business to compare
 * @param config - Configuration thresholds (uses defaults if not provided)
 * @returns DuplicateCheckResult with similarity scores and flag
 */
export function checkForDuplicate(
  business1: BusinessForComparison,
  business2: BusinessForComparison,
  config: DuplicateDetectionConfig = DEFAULT_DUPLICATE_CONFIG
): DuplicateCheckResult {
  // Calculate name similarity using normalized comparison
  const nameSimilarity = combinedSimilarity(business1.name, business2.name, {
    levenshteinWeight: config.nameWeight,
    jaccardWeight: 1 - config.nameWeight,
  });

  // Calculate address similarity using normalized comparison
  const addressSimilarity = combinedSimilarity(business1.address, business2.address, {
    levenshteinWeight: config.addressWeight,
    jaccardWeight: 1 - config.addressWeight,
  });

  // Calculate combined weighted score
  const combinedScore =
    config.nameWeight * nameSimilarity + config.addressWeight * addressSimilarity;

  // Check if both exceed their thresholds
  const nameAboveThreshold = nameSimilarity >= config.nameThreshold;
  const addressAboveThreshold = addressSimilarity >= config.addressThreshold;

  // Flag as potential duplicate only if BOTH name and address exceed thresholds
  const isPotentialDuplicate = nameAboveThreshold && addressAboveThreshold;

  return {
    isPotentialDuplicate,
    nameSimilarity,
    addressSimilarity,
    combinedScore,
    nameAboveThreshold,
    addressAboveThreshold,
  };
}

/**
 * Normalizes an address for comparison by:
 * - Converting to lowercase
 * - Removing extra whitespace
 * - Standardizing common abbreviations
 *
 * @param address - Address string to normalize
 * @returns Normalized address string
 */
export function normalizeAddress(address: string): string {
  return normalizeString(address);
}
