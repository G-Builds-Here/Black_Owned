/**
 * Business Data Validator
 *
 * Validates business data before import to ensure data quality and consistency.
 * Provides comprehensive validation for all business fields including contact info,
 * categories, ratings, and required fields.
 */

import { validatePhoneNumber, validateEmail, validateWebsiteUrl, sanitizePhoneNumber, sanitizeEmail, sanitizeWebsiteUrl } from "./contact-validator";
import { BusinessCategory } from "../../types/business";
import { ScraperSource } from "../../types/scraper-result";

/**
 * Validation error with field context
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validation result for business data
 */
export interface BusinessValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  sanitized?: SanitizedBusinessData;
}

/**
 * Sanitized business data ready for import
 */
export interface SanitizedBusinessData {
  name: string;
  description?: string;
  categoryId: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  source: ScraperSource;
  sourceData?: Record<string, unknown>;
}

/**
 * Input for business validation (raw scraped data)
 */
export interface BusinessValidationInput {
  name: string;
  description?: string;
  categoryId?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  rating?: number | string;
  reviewCount?: number | string;
  source: ScraperSource;
  sourceData?: Record<string, unknown>;
}

/**
 * Valid business categories mapping from scraper categories
 */
export const CATEGORY_MAPPING: Record<string, BusinessCategory> = {
  // Food & Dining
  "restaurant": "food-dining",
  "cafe": "food-dining",
  "bar": "food-dining",
  "barbecue": "food-dining",
  "pizza": "food-dining",
  "sushi": "food-dining",
  "italian-restaurant": "food-dining",
  "chinese-restaurant": "food-dining",
  "mexican-restaurant": "food-dining",
  "japanese-restaurant": "food-dining",
  "thai-restaurant": "food-dining",
  "indian-restaurant": "food-dining",
  "american-restaurant": "food-dining",
  "fast-food": "food-dining",
  "bakery": "food-dining",
  "ice-cream": "food-dining",
  "coffee-shop": "food-dining",
  "food-dining": "food-dining",

  // Professional Services
  "lawyer": "professional-services",
  "attorney": "professional-services",
  "accountant": "professional-services",
  "consultant": "professional-services",
  "real-estate": "professional-services",
  "realtor": "professional-services",
  "insurance": "professional-services",
  "financial-advisor": "professional-services",
  "marketing": "professional-services",
  "graphic-design": "professional-services",
  "web-design": "professional-services",
  "it-services": "professional-services",
  "professional-services": "professional-services",

  // Retail & Fashion
  "clothing-store": "retail-fashion",
  "fashion": "retail-fashion",
  "shoes": "retail-fashion",
  "jewelry": "retail-fashion",
  "electronics": "retail-fashion",
  "grocery": "retail-fashion",
  "convenience-store": "retail-fashion",
  "department-store": "retail-fashion",
  "furniture": "retail-fashion",
  "home-garden": "retail-fashion",
  "retail-fashion": "retail-fashion",

  // Health & Wellness
  "doctor": "health-wellness",
  "dentist": "health-wellness",
  "hospital": "health-wellness",
  "clinic": "health-wellness",
  "pharmacy": "health-wellness",
  "gym": "health-wellness",
  "spa": "health-wellness",
  "salon": "health-wellness",
  "barber": "health-wellness",
  "chiropractor": "health-wellness",
  "psychologist": "health-wellness",
  "veterinarian": "health-wellness",
  "health-wellness": "health-wellness",

  // Automotive
  "auto-repair": "automotive",
  "car-dealer": "automotive",
  "car-wash": "automotive",
  "gas-station": "automotive",
  "tire-shop": "automotive",
  "automotive": "automotive",

  // Home Services
  "plumber": "home-services",
  "electrician": "home-services",
  "hvac": "home-services",
  "cleaning-service": "home-services",
  "landscaping": "home-services",
  "moving-company": "home-services",
  "painter": "home-services",
  "carpenter": "home-services",
  "home-services": "home-services",

  // Entertainment
  "cinema": "entertainment",
  "theater": "entertainment",
  "music-venue": "entertainment",
  "nightclub": "entertainment",
  "bowling": "entertainment",
  "gaming": "entertainment",
  "fitness": "entertainment",
  "entertainment": "entertainment",

  // Education
  "school": "education",
  "university": "education",
  "college": "education",
  "tutoring": "education",
  "language-school": "education",
  "training": "education",
  "education": "education",

  // Financial Services
  "bank": "financial-services",
  "credit-union": "financial-services",
  "mortgage": "financial-services",
  "loan": "financial-services",
  "tax-service": "financial-services",
  "financial-services": "financial-services",

  // Other
  "other": "other",
};

/**
 * Validate required fields for business import
 */
function validateRequiredFields(input: BusinessValidationInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.name || input.name.trim().length === 0) {
    errors.push({
      field: "name",
      message: "Business name is required",
      value: input.name,
    });
  } else if (input.name.trim().length < 2) {
    errors.push({
      field: "name",
      message: "Business name must be at least 2 characters",
      value: input.name,
    });
  }

  if (!input.categoryId || input.categoryId.trim().length === 0) {
    errors.push({
      field: "categoryId",
      message: "Category ID is required",
      value: input.categoryId,
    });
  }

  return errors;
}

/**
 * Validate and normalize business category
 */
function validateCategory(categoryInput: string | undefined): { categoryId: string | undefined; errors: ValidationError[]; warnings: string[] } {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!categoryInput || categoryInput.trim().length === 0) {
    return { categoryId: undefined, errors, warnings };
  }

  const normalizedCategory = categoryInput.toLowerCase().trim().replace(/[\s_]+/g, "-");
  const mappedCategory = CATEGORY_MAPPING[normalizedCategory];

  if (!mappedCategory) {
    warnings.push(`Unknown category "${categoryInput}" - will use "other" as fallback`);
    return { categoryId: "other", errors, warnings };
  }

  return { categoryId: mappedCategory, errors, warnings };
}

/**
 * Validate and normalize rating
 */
function validateRating(rating: number | string | undefined): { rating: number | undefined; errors: ValidationError[] } {
  if (rating === undefined || rating === null || rating === "") {
    return { rating: undefined, errors: [] };
  }

  const numericRating = typeof rating === "string" ? parseFloat(rating) : rating;

  if (isNaN(numericRating)) {
    return {
      rating: undefined,
      errors: [{ field: "rating", message: `Invalid rating format: ${rating}`, value: rating }],
    };
  }

  if (numericRating < 1 || numericRating > 5) {
    return {
      rating: undefined,
      errors: [{ field: "rating", message: `Rating must be between 1 and 5, got: ${numericRating}`, value: numericRating }],
    };
  }

  return { rating: Math.round(numericRating * 10) / 10, errors: [] };
}

/**
 * Validate and normalize review count
 */
function validateReviewCount(reviewCount: number | string | undefined): { reviewCount: number | undefined; errors: ValidationError[] } {
  if (reviewCount === undefined || reviewCount === null || reviewCount === "") {
    return { reviewCount: undefined, errors: [] };
  }

  let numericCount: number;

  if (typeof reviewCount === "string") {
    const trimmed = reviewCount.trim().toUpperCase();
    const multiplier = trimmed.endsWith("K") ? 1000 : trimmed.endsWith("M") ? 1000000 : 1;
    const numericPart = trimmed.replace(/[^0-9.]/g, "");
    numericCount = parseFloat(numericPart) * multiplier;
    if (isNaN(numericCount) || numericCount < 0) {
      return {
        reviewCount: undefined,
        errors: [{ field: "reviewCount", message: `Invalid review count format: ${reviewCount}`, value: reviewCount }],
      };
    }
  } else {
    numericCount = reviewCount;
    if (isNaN(numericCount) || numericCount < 0) {
      return {
        reviewCount: undefined,
        errors: [{ field: "reviewCount", message: `Invalid review count: ${reviewCount}`, value: reviewCount }],
      };
    }
  }

  return { reviewCount: numericCount, errors: [] };
}

/**
 * Validate source
 */
function validateSource(source: ScraperSource): ValidationError[] {
  const validSources: ScraperSource[] = [ScraperSource.GOOGLE_MAPS, ScraperSource.YELP, ScraperSource.FACEBOOK];

  if (!validSources.includes(source)) {
    return [{ field: "source", message: `Invalid source: ${source}`, value: source }];
  }

  return [];
}

/**
 * Validate business data before import
 *
 * Performs comprehensive validation including:
 * - Required field validation
 * - Contact information validation (phone, email, website)
 * - Category mapping and validation
 * - Rating and review count validation
 * - Data sanitization
 *
 * @param input - Raw business data to validate
 * @returns Validation result with errors, warnings, and sanitized data
 */
export function validateBusinessData(input: BusinessValidationInput): BusinessValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Validate required fields
  errors.push(...validateRequiredFields(input));

  // Validate source
  errors.push(...validateSource(input.source));

  // Validate and normalize category
  const categoryResult = validateCategory(input.categoryId);
  errors.push(...categoryResult.errors);
  warnings.push(...categoryResult.warnings);

  // Validate rating
  const ratingResult = validateRating(input.rating);
  errors.push(...ratingResult.errors);

  // Validate review count
  const reviewCountResult = validateReviewCount(input.reviewCount);
  errors.push(...reviewCountResult.errors);

  // Validate and sanitize contact fields
  if (input.phone && !validatePhoneNumber(input.phone)) {
    errors.push({
      field: "phone",
      message: `Invalid phone format: ${input.phone}`,
      value: input.phone,
    });
  }

  if (input.email && !validateEmail(input.email)) {
    errors.push({
      field: "email",
      message: `Invalid email format: ${input.email}`,
      value: input.email,
    });
  }

  if (input.website && !validateWebsiteUrl(input.website)) {
    errors.push({
      field: "website",
      message: `Invalid website URL: ${input.website}`,
      value: input.website,
    });
  }

  // Build sanitized data
  const sanitized: SanitizedBusinessData = {
    name: input.name?.trim() || "",
    source: input.source,
    categoryId: categoryResult.categoryId || "other",
    sourceData: input.sourceData,
  };

  if (input.description) sanitized.description = input.description.trim();
  if (input.address) sanitized.address = input.address.trim();
  if (ratingResult.rating) sanitized.rating = ratingResult.rating;
  if (reviewCountResult.reviewCount) sanitized.reviewCount = reviewCountResult.reviewCount;
  if (input.phone) sanitized.phone = sanitizePhoneNumber(input.phone);
  if (input.email) sanitized.email = sanitizeEmail(input.email);
  if (input.website) sanitized.website = sanitizeWebsiteUrl(input.website);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitized,
  };
}

/**
 * Validate batch of business data
 *
 * @param inputs - Array of business data to validate
 * @returns Array of validation results
 */
export function validateBusinessDataBatch(inputs: BusinessValidationInput[]): BusinessValidationResult[] {
  return inputs.map((input) => validateBusinessData(input));
}

/**
 * Check if business data is valid (convenience function)
 *
 * @param input - Business data to validate
 * @returns true if valid, false otherwise
 */
export function isBusinessDataValid(input: BusinessValidationInput): boolean {
  return validateBusinessData(input).isValid;
}
