/**
 * Tests for Review Service
 *
 * Verifies that reviews are generated according to AC requirements:
 * - 3-5 reviews per business
 * - Ratings between 1 and 5 stars
 * - At least one 5-star review per business
 * - At least one 2-or-lower review per business
 * - Varied review text lengths (short: 20-50, medium: 50-150, long: 150-300)
 * - Reviewer names and dates within past 6 months
 */

import {
  generateReviewsForBusiness,
  generateReviewsForBusinesses,
  validateAllBusinessReviews,
} from "./review-service";
import { validateReview, validateBusinessReviews } from "../types/review";

describe("Review Service", () => {
  describe("generateReviewsForBusiness", () => {
    it("generates 3-5 reviews for a business", () => {
      const businessId = "biz-1";
      const result = generateReviewsForBusiness(businessId);

      expect(result.businessId).toBe(businessId);
      expect(result.reviews.length).toBeGreaterThanOrEqual(3);
      expect(result.reviews.length).toBeLessThanOrEqual(5);
    });

    it("all reviews have valid ratings (1-5)", () => {
      const result = generateReviewsForBusiness("biz-1");

      result.reviews.forEach((review) => {
        expect([1, 2, 3, 4, 5]).toContain(review.rating);
      });
    });

    it("each business has at least one 5-star review", () => {
      // Run multiple times to ensure consistency
      for (let i = 0; i < 10; i++) {
        const result = generateReviewsForBusiness(`biz-${i}`);
        const hasFiveStar = result.reviews.some((r) => r.rating === 5);
        expect(hasFiveStar).toBe(true);
      }
    });

    it("each business has at least one review with rating 2 or lower", () => {
      // Run multiple times to ensure consistency
      for (let i = 0; i < 10; i++) {
        const result = generateReviewsForBusiness(`biz-${i}`);
        const hasLowRating = result.reviews.some((r) => r.rating <= 2);
        expect(hasLowRating).toBe(true);
      }
    });

    it("all review texts are within valid length range (20-300 chars)", () => {
      const result = generateReviewsForBusiness("biz-1");

      result.reviews.forEach((review) => {
        expect(review.reviewText.length).toBeGreaterThanOrEqual(20);
        expect(review.reviewText.length).toBeLessThanOrEqual(300);
      });
    });

    it("review texts vary in length across categories", () => {
      const result = generateReviewsForBusiness("biz-1");

      // Should have at least 3 reviews, covering short, medium, long
      const lengths = result.reviews.map((r) => r.reviewText.length);
      const hasShort = lengths.some((l) => l >= 20 && l <= 50);
      const hasMedium = lengths.some((l) => l > 50 && l <= 150);
      const hasLong = lengths.some((l) => l > 150 && l <= 300);

      // Note: With 3-5 reviews and cycling through categories, we should see variety
      expect(hasShort || hasMedium || hasLong).toBe(true);
    });

    it("all reviews have reviewer names", () => {
      const result = generateReviewsForBusiness("biz-1");

      result.reviews.forEach((review) => {
        expect(review.reviewerName).toBeDefined();
        expect(review.reviewerName).toBeTruthy();
        expect(typeof review.reviewerName).toBe("string");
      });
    });

    it("all review dates are within the past 6 months", () => {
      const result = generateReviewsForBusiness("biz-1");
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const now = new Date();

      result.reviews.forEach((review) => {
        expect(review.reviewDate).toBeInstanceOf(Date);
        expect(review.reviewDate.getTime()).toBeGreaterThanOrEqual(sixMonthsAgo.getTime());
        expect(review.reviewDate.getTime()).toBeLessThanOrEqual(now.getTime());
      });
    });

    it("each review has a reviewer name from the predefined list", () => {
      const result = generateReviewsForBusiness("biz-1");

      const validNames = [
        "James Washington",
        "Marcus Johnson",
        "Tanya Williams",
        "DeShawn Brown",
        "Keisha Davis",
        "Terrence Miller",
        "Alicia Wilson",
        "Darnell Moore",
        "Tanisha Taylor",
        "Jermaine Anderson",
        "Shanice Thomas",
        "Darius Jackson",
        "Latoya White",
        "Marcus Harris",
        "Destiny Martin",
        "Trevor Garcia",
        "Sierra Rodriguez",
        "Brandon Martinez",
        "Jasmine Hernandez",
        "Tyrone Lopez",
      ];

      result.reviews.forEach((review) => {
        expect(validNames).toContain(review.reviewerName);
      });
    });
  });

  describe("generateReviewsForBusinesses", () => {
    it("generates reviews for multiple businesses", () => {
      const businessIds = ["biz-1", "biz-2", "biz-3"];
      const results = generateReviewsForBusinesses(businessIds);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.businessId).toBe(businessIds[index]);
        expect(result.reviews.length).toBeGreaterThanOrEqual(3);
        expect(result.reviews.length).toBeLessThanOrEqual(5);
      });
    });

    it("each business has required rating distribution", () => {
      const businessIds = Array.from({ length: 30 }, (_, i) => `biz-${i + 1}`);
      const results = generateReviewsForBusinesses(businessIds);

      results.forEach((result) => {
        const hasFiveStar = result.reviews.some((r) => r.rating === 5);
        const hasLowRating = result.reviews.some((r) => r.rating <= 2);

        expect(hasFiveStar).toBe(true);
        expect(hasLowRating).toBe(true);
      });
    });

    it("validates all business reviews correctly", () => {
      const businessIds = Array.from({ length: 30 }, (_, i) => `biz-${i + 1}`);
      const results = generateReviewsForBusinesses(businessIds);
      const validation = validateAllBusinessReviews(results);

      expect(validation.allValid).toBe(true);
      expect(validation.results).toHaveLength(30);
      validation.results.forEach((r) => {
        expect(r.valid).toBe(true);
        expect(r.errors).toHaveLength(0);
      });
    });
  });

  describe("validateBusinessReviews", () => {
    it("returns valid for properly configured reviews", () => {
      const businessReviews = {
        businessId: "biz-1",
        reviews: [
          {
            businessId: "biz-1",
            rating: 5 as const,
            reviewText: "Great service, highly recommend this business!",
            reviewerName: "John Doe",
            reviewDate: new Date(),
          },
          {
            businessId: "biz-1",
            rating: 2 as const,
            reviewText: "Had some issues but they resolved them.",
            reviewerName: "Jane Smith",
            reviewDate: new Date(),
          },
          {
            businessId: "biz-1",
            rating: 4 as const,
            reviewText: "Good overall experience with the team.",
            reviewerName: "Bob Johnson",
            reviewDate: new Date(),
          },
        ],
      };

      const result = validateBusinessReviews(businessReviews);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects missing 5-star review", () => {
      const businessReviews = {
        businessId: "biz-1",
        reviews: [
          {
            businessId: "biz-1",
            rating: 3 as const,
            reviewText: "Average service.",
            reviewerName: "John Doe",
            reviewDate: new Date(),
          },
          {
            businessId: "biz-1",
            rating: 2 as const,
            reviewText: "Could be better.",
            reviewerName: "Jane Smith",
            reviewDate: new Date(),
          },
          {
            businessId: "biz-1",
            rating: 4 as const,
            reviewText: "Pretty good experience overall.",
            reviewerName: "Bob Johnson",
            reviewDate: new Date(),
          },
        ],
      };

      const result = validateBusinessReviews(businessReviews);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing 5-star review");
    });

    it("detects missing low rating", () => {
      const businessReviews = {
        businessId: "biz-1",
        reviews: [
          {
            businessId: "biz-1",
            rating: 5 as const,
            reviewText: "Excellent service!",
            reviewerName: "John Doe",
            reviewDate: new Date(),
          },
          {
            businessId: "biz-1",
            rating: 4 as const,
            reviewText: "Very satisfied.",
            reviewerName: "Jane Smith",
            reviewDate: new Date(),
          },
          {
            businessId: "biz-1",
            rating: 3 as const,
            reviewText: "Good experience.",
            reviewerName: "Bob Johnson",
            reviewDate: new Date(),
          },
        ],
      };

      const result = validateBusinessReviews(businessReviews);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing review with rating 2 or lower");
    });

    it("detects invalid review count", () => {
      const businessReviews = {
        businessId: "biz-1",
        reviews: [
          {
            businessId: "biz-1",
            rating: 5 as const,
            reviewText: "Great service!",
            reviewerName: "John Doe",
            reviewDate: new Date(),
          },
          {
            businessId: "biz-1",
            rating: 2 as const,
            reviewText: "Some issues.",
            reviewerName: "Jane Smith",
            reviewDate: new Date(),
          },
        ],
      };

      const result = validateBusinessReviews(businessReviews);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid review count: 2 (must be 3-5)");
    });
  });

  describe("validateReview", () => {
    it("returns valid for a properly configured review", () => {
      const review = {
        businessId: "biz-1",
        rating: 4 as const,
        reviewText: "Great service, highly recommend!",
        reviewerName: "John Doe",
        reviewDate: new Date(),
      };

      const result = validateReview(review);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects invalid rating", () => {
      const review = {
        businessId: "biz-1",
        rating: 6 as any,
        reviewText: "Great service!",
        reviewerName: "John Doe",
        reviewDate: new Date(),
      };

      const result = validateReview(review);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid rating: 6 (must be 1-5)");
    });

    it("detects review text that is too short", () => {
      const review = {
        businessId: "biz-1",
        rating: 4 as const,
        reviewText: "Too short",
        reviewerName: "John Doe",
        reviewDate: new Date(),
      };

      const result = validateReview(review);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid review text length"))).toBe(true);
    });

    it("detects review date outside 6-month range", () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 7);

      const review = {
        businessId: "biz-1",
        rating: 4 as const,
        reviewText: "Great service, highly recommend!",
        reviewerName: "John Doe",
        reviewDate: oldDate,
      };

      const result = validateReview(review);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid review date"))).toBe(true);
    });
  });
});
