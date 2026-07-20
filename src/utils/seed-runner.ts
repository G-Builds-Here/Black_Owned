/**
 * Seed Runner - Idempotent Test Data Seeding
 *
 * Executes the seeding of test data (businesses, reviews, images, users)
 * with idempotency guarantees:
 * - Checks for existing test data before creating
 * - Skips creation if data already exists
 * - Outputs summary of what was created vs skipped
 *
 * Usage:
 *   npm run seed           # Seed all data
 *   npm run seed -- --reset  # Clear existing test data first
 */

import {
  TEST_PREFIX,
  TEST_EMAIL_DOMAIN,
  generateBusinessesWithImages,
  generateTestUsers,
  TestBusinessWithImages,
  TestUser,
} from "./test-data-seeder";
import { generateImagesForBusiness } from "../services/image-service";
import { generateReviewsForBusinesses } from "../services/review-service";

/**
 * Seed result summary
 */
export interface SeedSummary {
  businessesCreated: number;
  businessesSkipped: number;
  reviewsCreated: number;
  reviewsSkipped: number;
  imagesCreated: number;
  imagesSkipped: number;
  usersCreated: number;
  usersSkipped: number;
  totalRuntime: string;
}

/**
 * Simulated database storage (in-memory for testing)
 * In production, this would be replaced with actual database queries
 */
interface SeedDatabase {
  businesses: Map<string, TestBusinessWithImages>;
  users: Map<string, TestUser>;
  reviews: Map<string, any[]>; // businessId -> reviews
  images: Map<string, any[]>; // businessId -> images
}

/**
 * Create empty database instance
 */
function createDatabase(): SeedDatabase {
  return {
    businesses: new Map(),
    users: new Map(),
    reviews: new Map(),
    images: new Map(),
  };
}

/**
 * Global database instance (simulated)
 * In production, this would connect to actual database
 */
let db: SeedDatabase = createDatabase();

/**
 * Check if a business already exists in the database
 * Idempotency check: returns true if business with same name exists
 */
export function businessExists(businessName: string): boolean {
  return db.businesses.has(businessName);
}

/**
 * Check if a user already exists in the database
 * Idempotency check: returns true if user with same email exists
 */
export function userExists(email: string): boolean {
  return db.users.has(email);
}

/**
 * Check if reviews exist for a business
 */
export function reviewsExistForBusiness(businessId: string): boolean {
  return db.reviews.has(businessId) && db.reviews.get(businessId)!.length > 0;
}

/**
 * Check if images exist for a business
 */
export function imagesExistForBusiness(businessId: string): boolean {
  return db.images.has(businessId) && db.images.get(businessId)!.length > 0;
}

/**
 * Count existing test businesses
 */
export function countTestBusinesses(): number {
  return db.businesses.size;
}

/**
 * Count existing test users
 */
export function countTestUsers(): number {
  return db.users.size;
}

/**
 * Clear all test data from the database
 * Used for --reset flag
 */
export function clearTestData(): void {
  db = createDatabase();
}

/**
 * Check if any test data exists
 */
export function hasTestData(): boolean {
  return db.businesses.size > 0 || db.users.size > 0;
}

/**
 * Seed businesses with idempotency
 * Returns array of created business IDs and count of skipped
 */
function seedBusinesses(): { created: TestBusinessWithImages[]; skipped: number } {
  const businesses = generateBusinessesWithImages(30);
  const created: TestBusinessWithImages[] = [];
  let skipped = 0;

  for (const business of businesses) {
    if (businessExists(business.formattedName)) {
      skipped++;
    } else {
      db.businesses.set(business.formattedName, business);
      created.push(business);
    }
  }

  return { created, skipped };
}

/**
 * Seed reviews with idempotency
 * Only creates reviews for businesses that don't already have them
 */
function seedReviews(
  businesses: TestBusinessWithImages[]
): { created: number; skipped: number } {
  let created = 0;
  let skipped = 0;

  for (const business of businesses) {
    if (reviewsExistForBusiness(business.id!)) {
      skipped++;
    } else {
      const reviews = generateReviewsForBusinesses([business.id!]);
      db.reviews.set(business.id!, reviews[0].reviews);
      created++;
    }
  }

  return { created, skipped };
}

/**
 * Seed images with idempotency
 * Only creates images for businesses that don't already have them
 */
function seedImages(
  businesses: TestBusinessWithImages[]
): { created: number; skipped: number } {
  let created = 0;
  let skipped = 0;

  for (const business of businesses) {
    if (imagesExistForBusiness(business.id!)) {
      skipped++;
    } else {
      const imageData = generateImagesForBusiness(
        business.id!,
        business.formattedName,
        business.category || "restaurants"
      );
      db.images.set(business.id!, imageData.images);
      created += imageData.images.length;
    }
  }

  return { created, skipped };
}

/**
 * Seed users with idempotency
 */
function seedUsers(): { created: number; skipped: number } {
  const users = generateTestUsers(10);
  let created = 0;
  let skipped = 0;

  for (const user of users) {
    if (userExists(user.formattedEmail)) {
      skipped++;
    } else {
      db.users.set(user.formattedEmail, user);
      created++;
    }
  }

  return { created, skipped };
}

/**
 * Main seed function - idempotent execution
 *
 * @param reset - If true, clears existing test data before seeding
 * @returns SeedSummary with counts of created vs skipped items
 */
export async function runSeed(reset: boolean = false): Promise<SeedSummary> {
  const startTime = Date.now();

  // Optional reset
  if (reset) {
    console.log("Clearing existing test data...");
    clearTestData();
  }

  // Check if data already exists
  const existingBusinessCount = countTestBusinesses();
  const existingUserCount = countTestUsers();

  if (existingBusinessCount > 0 || existingUserCount > 0) {
    console.log(
      `Found existing test data: ${existingBusinessCount} businesses, ${existingUserCount} users`
    );
    console.log("Running in idempotent mode - will skip existing data");
  }

  // Seed businesses (idempotent)
  const businessResult = seedBusinesses();

  // Get all 30 businesses (both newly created and existing) for review/image checks
  const allBusinesses = generateBusinessesWithImages(30);

  // Seed reviews for all businesses (idempotent - checks each business)
  const reviewResult = seedReviews(allBusinesses);

  // Seed images for all businesses (idempotent - checks each business)
  const imageResult = seedImages(allBusinesses);

  // Seed users (idempotent)
  const userResult = seedUsers();

  const endTime = Date.now();
  const runtime = `${endTime - startTime}ms`;

  const summary: SeedSummary = {
    businessesCreated: businessResult.created.length,
    businessesSkipped: businessResult.skipped,
    reviewsCreated: reviewResult.created,
    reviewsSkipped: reviewResult.skipped,
    imagesCreated: imageResult.created,
    imagesSkipped: imageResult.skipped,
    usersCreated: userResult.created,
    usersSkipped: userResult.skipped,
    totalRuntime: runtime,
  };

  return summary;
}

/**
 * Print seed summary to console
 */
export function printSummary(summary: SeedSummary): void {
  console.log("\n========== Seed Summary ==========");
  console.log(`Businesses:  ${summary.businessesCreated} created, ${summary.businessesSkipped} skipped`);
  console.log(`Reviews:     ${summary.reviewsCreated} created, ${summary.reviewsSkipped} skipped`);
  console.log(`Images:      ${summary.imagesCreated} created, ${summary.imagesSkipped} skipped`);
  console.log(`Users:       ${summary.usersCreated} created, ${summary.usersSkipped} skipped`);
  console.log(`Runtime:     ${summary.totalRuntime}`);
  console.log("==================================");
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");

  console.log("Starting test data seed...");
  console.log(`Mode: ${reset ? "reset + seed" : "idempotent seed"}`);

  const summary = await runSeed(reset);
  printSummary(summary);

  // Exit with appropriate code
  if (summary.businessesCreated === 0 && summary.usersCreated === 0) {
    console.log("\nNo new data created - all data already exists (idempotent behavior)");
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

// Export for testing
export { db };
