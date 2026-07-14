/**
 * Review Types
 *
 * Defines the data structures for business reviews.
 */

export interface Review {
  id?: string;
  businessId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  reviewText: string;
  reviewerName: string;
  reviewDate: Date;
}

export type ReviewLengthCategory = "short" | "medium" | "long";

export interface ReviewLengthConfig {
  category: ReviewLengthCategory;
  minLength: number;
  maxLength: number;
}

export const REVIEW_LENGTH_CONFIGS: Record<ReviewLengthCategory, ReviewLengthConfig> = {
  short: { category: "short", minLength: 20, maxLength: 50 },
  medium: { category: "medium", minLength: 50, maxLength: 150 },
  long: { category: "long", minLength: 150, maxLength: 300 },
};

export interface BusinessReviewData {
  businessId: string;
  reviews: Review[];
}

/**
 * Validates that a review meets the AC requirements:
 * - Rating is between 1 and 5
 * - Review text length is within valid range
 * - Review date is within the past 6 months
 */
export function validateReview(review: Review): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (review.rating < 1 || review.rating > 5) {
    errors.push(`Invalid rating: ${review.rating} (must be 1-5)`);
  }

  const textLength = review.reviewText.length;
  if (textLength < 20 || textLength > 300) {
    errors.push(`Invalid review text length: ${textLength} (must be 20-300)`);
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  if (review.reviewDate < sixMonthsAgo || review.reviewDate > new Date()) {
    errors.push(`Invalid review date: ${review.reviewDate.toISOString()} (must be within past 6 months)`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates that a business's reviews meet AC requirements:
 * - Has 3-5 reviews
 * - Has at least one 5-star review
 * - Has at least one 2-or-lower review
 */
export function validateBusinessReviews(businessReviews: BusinessReviewData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (businessReviews.reviews.length < 3 || businessReviews.reviews.length > 5) {
    errors.push(`Invalid review count: ${businessReviews.reviews.length} (must be 3-5)`);
  }

  const hasFiveStar = businessReviews.reviews.some((r) => r.rating === 5);
  if (!hasFiveStar) {
    errors.push("Missing 5-star review");
  }

  const hasLowReview = businessReviews.reviews.some((r) => r.rating <= 2);
  if (!hasLowReview) {
    errors.push("Missing review with rating 2 or lower");
  }

  // Validate each individual review
  for (const review of businessReviews.reviews) {
    const reviewValidation = validateReview(review);
    if (!reviewValidation.valid) {
      errors.push(...reviewValidation.errors.map((e) => `Review: ${e}`));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
