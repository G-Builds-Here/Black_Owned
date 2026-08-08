/**
 * Business Metadata Service
 *
 * Extracts and normalizes business metadata from scraper sources.
 * Handles category mapping, rating normalization, and review count parsing.
 */

import { BusinessMetadata, ScraperRawData, NormalizationResult } from "../types/business-metadata";

/**
 * Map scraper category to standardized business category
 */
function mapCategory(rawCategory: string): string {
  const normalized = rawCategory.toLowerCase().trim();

  // Food and dining
  if (
    normalized.includes("restaurant") ||
    normalized.includes("cafe") ||
    normalized.includes("bar") ||
    normalized.includes("lounge") ||
    normalized.includes("food") ||
    normalized.includes("dining") ||
    normalized.includes("bakery") ||
    normalized.includes("pizza") ||
    normalized.includes("coffee")
  ) {
    return "food-dining";
  }

  // Professional services
  if (
    normalized.includes("lawyer") ||
    normalized.includes("attorney") ||
    normalized.includes("accountant") ||
    normalized.includes("consultant") ||
    normalized.includes("real estate") ||
    normalized.includes("realtor") ||
    normalized.includes("insurance") ||
    normalized.includes("financial") ||
    normalized.includes("marketing") ||
    normalized.includes("agency")
  ) {
    return "professional-services";
  }

  // Retail and fashion
  if (
    normalized.includes("store") ||
    normalized.includes("shop") ||
    normalized.includes("retail") ||
    normalized.includes("clothing") ||
    normalized.includes("fashion") ||
    normalized.includes("boutique") ||
    normalized.includes("market")
  ) {
    return "retail-fashion";
  }

  // Health and wellness
  if (
    normalized.includes("health") ||
    normalized.includes("wellness") ||
    normalized.includes("gym") ||
    normalized.includes("fitness") ||
    normalized.includes("spa") ||
    normalized.includes("salon") ||
    normalized.includes("doctor") ||
    normalized.includes("clinic") ||
    normalized.includes("therapy")
  ) {
    return "health-wellness";
  }

  // Automotive
  if (
    normalized.includes("auto") ||
    normalized.includes("car") ||
    normalized.includes("mechanic") ||
    normalized.includes("garage") ||
    normalized.includes("dealership") ||
    normalized.includes("tire")
  ) {
    return "automotive";
  }

  // Home services
  if (
    normalized.includes("plumber") ||
    normalized.includes("electrician") ||
    normalized.includes("contractor") ||
    normalized.includes("cleaning") ||
    normalized.includes("landscaping") ||
    normalized.includes("hvac") ||
    normalized.includes("repair")
  ) {
    return "home-services";
  }

  // Entertainment
  if (
    normalized.includes("entertainment") ||
    normalized.includes("gaming") ||
    normalized.includes("arcade") ||
    normalized.includes("theater") ||
    normalized.includes("music") ||
    normalized.includes("event")
  ) {
    return "entertainment";
  }

  // Education
  if (
    normalized.includes("school") ||
    normalized.includes("academy") ||
    normalized.includes("tutor") ||
    normalized.includes("training") ||
    normalized.includes("education") ||
    normalized.includes("learning")
  ) {
    return "education";
  }

  // Financial services
  if (
    normalized.includes("bank") ||
    normalized.includes("credit union") ||
    normalized.includes("loan") ||
    normalized.includes("mortgage") ||
    normalized.includes("investment")
  ) {
    return "financial-services";
  }

  // Default to other
  return "other";
}

/**
 * Normalize rating to a 1-5 scale
 */
function normalizeRating(rawRating: string | number): number {
  let ratingValue: number;

  if (typeof rawRating === "string") {
    // Extract numeric value from strings like "4.5 stars" or "4.5/5"
    const match = rawRating.match(/(\d+\.?\d*)/);
    if (!match) {
      return 0;
    }
    ratingValue = parseFloat(match[1]);
  } else {
    ratingValue = rawRating;
  }

  // Clamp to 1-5 range
  if (ratingValue < 1) return 0; // Invalid
  if (ratingValue > 5) return 0; // Invalid

  return Math.round(ratingValue * 100) / 100; // Round to 2 decimal places
}

/**
 * Parse review count from various formats
 */
function parseReviewCount(rawCount: string | number): number {
  if (typeof rawCount === "number") {
    return Math.max(0, Math.floor(rawCount));
  }

  const str = rawCount.trim();

  // Handle "K" suffix (e.g., "1.2K" -> 1200)
  if (str.toUpperCase().endsWith("K")) {
    const value = parseFloat(str.slice(0, -1));
    return Math.floor(value * 1000);
  }

  // Handle "M" suffix (e.g., "2.5M" -> 2500000)
  if (str.toUpperCase().endsWith("M")) {
    const value = parseFloat(str.slice(0, -1));
    return Math.floor(value * 1000000);
  }

  // Remove any non-numeric characters except decimal point
  const cleaned = str.replace(/[^\d.]/g, "");
  const value = parseFloat(cleaned);

  if (isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

/**
 * Extract business metadata from scraper raw data
 *
 * @param rawData - Raw data from a scraper source
 * @returns NormalizationResult with extracted metadata or validation errors
 */
export function extractBusinessMetadata(rawData: ScraperRawData): NormalizationResult {
  const errors: string[] = [];

  // Validate required fields
  if (!rawData.name || rawData.name.trim() === "") {
    errors.push("Business name is required");
  }

  if (!rawData.category || rawData.category.trim() === "") {
    errors.push("Business category is required");
  }

  // Normalize rating
  const normalizedRating = normalizeRating(rawData.rating);
  if (normalizedRating === 0 && rawData.rating !== 0) {
    errors.push(`Invalid rating format: ${rawData.rating}`);
  }

  // Parse review count
  const parsedReviewCount = parseReviewCount(rawData.reviewCount);

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  const metadata: BusinessMetadata = {
    name: rawData.name.trim(),
    category: mapCategory(rawData.category),
    rating: normalizedRating,
    reviewCount: parsedReviewCount,
  };

  // Add optional fields if present
  if (rawData.address) {
    metadata.address = rawData.address.trim();
  }
  if (rawData.phone) {
    metadata.phone = rawData.phone.trim();
  }
  if (rawData.website) {
    metadata.website = rawData.website.trim();
  }

  return {
    success: true,
    metadata,
    errors: [],
  };
}

/**
 * Batch extract metadata from multiple scraper results
 *
 * @param rawDataList - Array of raw scraper data
 * @returns Array of normalization results
 */
export function extractBatchMetadata(rawDataList: ScraperRawData[]): NormalizationResult[] {
  return rawDataList.map((data) => extractBusinessMetadata(data));
}
