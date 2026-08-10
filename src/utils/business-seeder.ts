/**
 * Business Seeder
 *
 * Generates sample business data for seeding the database.
 * Meets AC requirements:
 * - 20 sample businesses
 * - Multiple categories (restaurant, retail, service)
 * - All required fields populated
 * - BWS-TEST prefix for test identification
 *
 * Foreign Key Constraints:
 * - All businesses require a valid owner_id referencing users(id)
 * - The seed script ensures a test user exists before creating businesses
 */

import { PoolClient } from "pg";
import { TEST_PREFIX, formatBusinessName } from "./test-data-seeder";
import { BusinessCategory } from "../types/business";
import { getTableName, createBusiness } from "../lib/db/business-repository";

/**
 * Sample business template
 */
export interface SampleBusiness {
  id?: string;
  name: string;
  description: string;
  categoryId: BusinessCategory;
}

/**
 * Business templates organized by category
 */
const BUSINESS_TEMPLATES: Record<BusinessCategory, Array<{ name: string; description: string }>> = {
  "food-dining": [
    { name: "Soul Food Kitchen", description: "Traditional Southern cuisine with a modern twist" },
    { name: "Community Taco Bar", description: "Authentic Mexican street food and fresh ingredients" },
    { name: "Harlem Soul Cafe", description: "Breakfast and lunch spot serving comfort classics" },
  ],
  "retail-fashion": [
    { name: "Urban Style Boutique", description: "Trendy clothing and accessories for all ages" },
    { name: "Community Thrift Store", description: "Affordable quality clothing and home goods" },
  ],
  "professional-services": [
    { name: "Black Professionals Consulting", description: "Business strategy and financial planning services" },
    { name: "Community Legal Aid", description: "Accessible legal services for families and small businesses" },
  ],
  "health-wellness": [
    { name: "Wellness First Clinic", description: "Comprehensive healthcare with cultural competency" },
    { name: "Community Fitness Center", description: "Affordable gym with group classes and personal training" },
  ],
  automotive: [
    { name: "Reliable Auto Repair", description: "Full-service auto repair and maintenance" },
  ],
  "home-services": [
    { name: "Quality Home Solutions", description: "Plumbing, electrical, and general home repair" },
  ],
  entertainment: [
    { name: "Community Arts Center", description: "Cultural events, workshops, and live performances" },
  ],
  education: [
    { name: "Bright Futures Tutoring", description: "Academic support for students of all ages" },
  ],
  "financial-services": [
    { name: "Community Credit Union", description: "Member-owned financial services and loans" },
  ],
  other: [
    { name: "Neighborhood Barbershop", description: "Classic cuts and modern styling" },
  ],
};

/**
 * Category distribution for balanced seeding
 */
const CATEGORY_DISTRIBUTION: Array<{ category: BusinessCategory; count: number }> = [
  { category: "food-dining", count: 5 },
  { category: "retail-fashion", count: 4 },
  { category: "professional-services", count: 3 },
  { category: "health-wellness", count: 3 },
  { category: "automotive", count: 1 },
  { category: "home-services", count: 1 },
  { category: "entertainment", count: 1 },
  { category: "education", count: 1 },
  { category: "financial-services", count: 1 },
];

/**
 * Generates a UUID for business IDs
 */
function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates exactly 20 sample businesses covering multiple categories
 * Each business has the BWS-TEST prefix for test data identification
 */
export function generateSampleBusinesses(): SampleBusiness[] {
  const businesses: SampleBusiness[] = [];
  let businessIndex = 0;

  for (const { category, count } of CATEGORY_DISTRIBUTION) {
    const templates = BUSINESS_TEMPLATES[category];

    for (let i = 0; i < count; i++) {
      const templateIndex = i % templates.length;
      const template = templates[templateIndex];
      const suffix = templates.length > 1 && count > templates.length ? ` ${Math.floor(i / templates.length) + 1}` : "";

      const businessName = `${template.name}${suffix}`;
      const formattedName = formatBusinessName(businessName);

      businesses.push({
        id: generateUuid(),
        name: formattedName,
        description: template.description,
        categoryId: category,
      });

      businessIndex++;
    }
  }

  return businesses;
}

/**
 * Returns the category distribution of generated businesses
 * Useful for verifying coverage across categories
 */
export function getCategoryDistribution(): Record<BusinessCategory, number> {
  const businesses = generateSampleBusinesses();
  const distribution: Record<string, number> = {};

  // Initialize all categories to 0
  (Object.keys(BUSINESS_TEMPLATES) as BusinessCategory[]).forEach((cat) => {
    distribution[cat] = 0;
  });

  // Count businesses per category
  for (const business of businesses) {
    distribution[business.categoryId] = (distribution[business.categoryId] || 0) + 1;
  }

  return distribution as Record<BusinessCategory, number>;
}

/**
 * Prints the category distribution to the console
 * Useful for CLI verification
 */
export function printCategoryDistribution(): void {
  const distribution = getCategoryDistribution();

  console.log("\n========== Category Distribution ==========");
  console.log(`Total businesses: ${Object.values(distribution).reduce((sum, count) => sum + count, 0)}`);
  console.log("");

  for (const [category, count] of Object.entries(distribution)) {
    const bar = "#".repeat(count);
    console.log(`${category.padEnd(25)} ${count.toString().padStart(2)} ${bar}`);
  }

  console.log("==========================================\n");
}

/**
 * CLI entry point for testing the seeder
 */
function main(): void {
  console.log("Generating sample businesses...\n");

  const businesses = generateSampleBusinesses();

  console.log(`Generated ${businesses.length} businesses:\n`);

  for (const business of businesses) {
    console.log(`- ${business.name} (${business.categoryId})`);
  }

  printCategoryDistribution();
}

// Run if executed directly
if (require.main === module) {
  main();
}

/**
 * Seed result from database operation
 */
export interface SeedResult {
  created: number;
  skipped: number;
  total: number;
}

/**
 * Seed businesses into the database with foreign key constraint compliance.
 *
 * This function:
 * 1. Generates 20 sample businesses
 * 2. Checks which ones already exist (by name)
 * 3. Creates only the missing ones with the provided ownerId
 * 4. Returns a summary of the operation
 *
 * @param client - PostgreSQL client for database operations
 * @param ownerId - UUID of the user who owns these businesses (satisfies FK constraint)
 * @param reset - If true, clears existing test data before seeding
 * @returns SeedResult with counts of created/skipped/total businesses
 */
export async function seedBusinesses(
  client: PoolClient,
  ownerId: string,
  reset: boolean = false
): Promise<SeedResult> {
  const tableName = getTableName();
  const businesses = generateSampleBusinesses();
  let created = 0;
  let skipped = 0;

  // If reset is requested, clear existing test data first
  if (reset) {
    console.log("Clearing existing test businesses...");
    await client.query(`DELETE FROM ${tableName} WHERE name LIKE '${TEST_PREFIX}%'`);
    console.log("Existing test businesses cleared.");
  }

  // Seed each business
  for (const business of businesses) {
    // Check if business already exists
    const existing = await client.query(
      `SELECT id FROM ${tableName} WHERE name = $1`,
      [business.name]
    );

    if (existing.rows.length > 0) {
      console.log(`[SKIP] Business already exists: ${business.name}`);
      skipped++;
    } else {
      // Create business with valid owner_id (foreign key constraint satisfied)
      await createBusiness(
        client,
        ownerId,
        business.name,
        business.description,
        business.categoryId
      );
      console.log(`[CREATE] Business created: ${business.name}`);
      created++;
    }
  }

  return {
    created,
    skipped,
    total: businesses.length,
  };
}

/**
 * Count existing test businesses in the database
 */
export async function countTestBusinesses(client: PoolClient): Promise<number> {
  const tableName = getTableName();
  const result = await client.query(
    `SELECT COUNT(*) FROM ${tableName} WHERE name LIKE '${TEST_PREFIX}%'`
  );
  return parseInt((result.rows[0] as { count: string }).count, 10);
}

// Export for testing
export { BUSINESS_TEMPLATES, CATEGORY_DISTRIBUTION };
