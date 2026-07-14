/**
 * Review Service
 *
 * Generates reviews for businesses according to AC requirements:
 * - 3-5 reviews per business
 * - Ratings 1-5 stars
 * - At least one 5-star and one 2-or-lower review per business
 * - Varied review text lengths (short: 20-50, medium: 50-150, long: 150-300 chars)
 * - Reviewer names and dates within past 6 months
 */

import {
  Review,
  BusinessReviewData,
  REVIEW_LENGTH_CONFIGS,
  ReviewLengthCategory,
  validateBusinessReviews,
} from "../types/review";

/**
 * Sample reviewer names for generating realistic review data
 */
const REVIEWER_NAMES = [
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

/**
 * Sample review text templates for different length categories
 */
const SHORT_TEMPLATES = [
  "Great service, highly recommend!",
  "Excellent experience overall.",
  "Very satisfied with the quality.",
  "Fast and professional service.",
  "Would definitely use again.",
  "Amazing work, thank you!",
  "Top notch quality and care.",
  "Fantastic experience all around.",
];

const MEDIUM_TEMPLATES = [
  "I had a wonderful experience with this business. The staff was friendly and professional, and the quality of work exceeded my expectations. I would definitely recommend them to anyone looking for reliable service.",
  "This place truly cares about their customers. From the moment I walked in, I felt welcomed and valued. The attention to detail was impressive, and the final result was exactly what I was looking for.",
  "After trying several businesses in this area, I finally found the right one. Their expertise and dedication to quality really shows in their work. I will be a returning customer for sure.",
  "The team went above and beyond to make sure I was satisfied. They took the time to understand my needs and delivered results that were better than expected. Highly recommend their services.",
  "Professional, reliable, and affordable. This business checked all the boxes for me. The communication was excellent throughout the process, and they delivered on their promises.",
];

const LONG_TEMPLATES = [
  "I cannot say enough good things about this business. From start to finish, the entire experience was exceptional. The team took the time to listen to my needs, provided clear communication throughout the process, and delivered results that far exceeded my expectations. Their attention to detail and commitment to quality is truly remarkable. I have already recommended them to several friends and family members, and I will definitely be using their services again in the future. If you are looking for a business that truly cares about their customers and takes pride in their work, look no further.",
  "After years of searching for the right service provider, I finally found a company that truly understands what it means to deliver excellence. Every interaction was professional, every step of the process was clearly explained, and the final result was nothing short of perfect. What impressed me most was their genuine care for customer satisfaction - they didn't just complete the job, they made sure I was completely happy with the outcome. The value they provide is unmatched in this industry, and I feel fortunate to have discovered them. I give them my highest recommendation without any hesitation.",
  "This business has set a new standard for what customer service should look like. From my initial inquiry to the final delivery, every interaction was handled with care, professionalism, and a genuine desire to help. The quality of their work speaks for itself, but it is their commitment to customer satisfaction that truly sets them apart. They went above and beyond what was expected, offering suggestions and improvements that I had not even considered. The entire team is knowledgeable, friendly, and dedicated to excellence. I am so glad I chose them for my needs, and I will not hesitate to use their services again.",
  "I have worked with many businesses over the years, and this one stands out as truly exceptional. They combine technical expertise with genuine customer care in a way that is rare to find. The project was completed on time, within budget, and the quality was outstanding. But what really made the difference was how they treated me as a partner throughout the process - listening to my concerns, addressing my questions promptly, and ensuring I was comfortable with every decision. This is the kind of business that earns loyal customers through their actions, not just their marketing. I am thrilled with the results and look forward to working with them again.",
];

/**
 * Generates a random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a random date within the past 6 months
 */
function randomDateWithinSixMonths(): Date {
  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const timeRange = now.getTime() - sixMonthsAgo.getTime();
  const randomTime = sixMonthsAgo.getTime() + Math.random() * timeRange;

  return new Date(randomTime);
}

/**
 * Selects a random element from an array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

/**
 * Generates a random review text of the specified length category
 */
function generateReviewText(category: ReviewLengthCategory): string {
  const config = REVIEW_LENGTH_CONFIGS[category];
  const templates =
    category === "short"
      ? SHORT_TEMPLATES
      : category === "medium"
      ? MEDIUM_TEMPLATES
      : LONG_TEMPLATES;

  let text = randomChoice(templates);

  // Adjust length if needed
  while (text.length < config.minLength) {
    text += " " + randomChoice(SHORT_TEMPLATES);
  }

  if (text.length > config.maxLength) {
    text = text.substring(0, config.maxLength);
  }

  return text.trim();
}

/**
 * Generates a random reviewer name
 */
function generateReviewerName(): string {
  return randomChoice(REVIEWER_NAMES);
}

/**
 * Generates a random rating ensuring the constraints are met
 * @param ensureFiveStar - If true, guarantees a 5-star rating
 * @param ensureLowRating - If true, guarantees a rating of 2 or lower
 */
function generateRating(ensureFiveStar: boolean = false, ensureLowRating: boolean = false): 1 | 2 | 3 | 4 | 5 {
  if (ensureFiveStar) return 5;
  if (ensureLowRating) return randomInt(1, 2) as 1 | 2;
  return randomInt(1, 5) as 1 | 2 | 3 | 4 | 5;
}

/**
 * Generates reviews for a single business
 * Ensures: 3-5 reviews, at least one 5-star, at least one 2-or-lower
 */
export function generateReviewsForBusiness(businessId: string): BusinessReviewData {
  const reviewCount = randomInt(3, 5);
  const reviews: Review[] = [];

  // Ensure we have at least one 5-star and one low rating
  const hasFiveStar = randomInt(0, reviewCount - 1);
  const hasLowRating = randomInt(0, reviewCount - 1);

  // Ensure they are different reviews
  const lowRatingIndex = hasFiveStar === hasLowRating ? (hasLowRating + 1) % reviewCount : hasLowRating;

  // Distribute length categories across reviews
  const lengthCategories: ReviewLengthCategory[] = ["short", "medium", "long"];

  for (let i = 0; i < reviewCount; i++) {
    const rating =
      i === hasFiveStar
        ? generateRating(true, false)
        : i === lowRatingIndex
        ? generateRating(false, true)
        : generateRating(false, false);

    const category = lengthCategories[i % lengthCategories.length];

    const review: Review = {
      businessId,
      rating,
      reviewText: generateReviewText(category),
      reviewerName: generateReviewerName(),
      reviewDate: randomDateWithinSixMonths(),
    };

    reviews.push(review);
  }

  return {
    businessId,
    reviews,
  };
}

/**
 * Generates reviews for multiple businesses
 */
export function generateReviewsForBusinesses(businessIds: string[]): BusinessReviewData[] {
  return businessIds.map((businessId) => generateReviewsForBusiness(businessId));
}

/**
 * Validates all generated business reviews
 */
export function validateAllBusinessReviews(businessReviewsList: BusinessReviewData[]): {
  allValid: boolean;
  results: { businessId: string; valid: boolean; errors: string[] }[];
} {
  const results = businessReviewsList.map((businessReviews) => {
    const validation = validateBusinessReviews(businessReviews);
    return {
      businessId: businessReviews.businessId,
      valid: validation.valid,
      errors: validation.errors,
    };
  });

  const allValid = results.every((r) => r.valid);

  return { allValid, results };
}
