/**
 * Seed Script: Create Sample Businesses
 *
 * This script creates 20 sample businesses for development and testing.
 * Businesses cover multiple categories (restaurant, retail, service).
 *
 * IMPORTANT: This script respects foreign key constraints by:
 * - Ensuring a test user exists before creating businesses
 * - Using the test user's ID as owner_id for all businesses
 *
 * Usage:
 *   npm run seed:businesses           # Seed 20 businesses
 *   npm run seed:businesses:reset     # Clear and reseed
 */

import { Pool, PoolClient } from "pg";
import { seedBusinesses, countTestBusinesses, printCategoryDistribution } from "../src/utils/business-seeder";
import { initializeBusinessSchema, getTableName } from "../src/lib/db/business-repository";
import { hashPassword } from "../src/lib/auth/auth-service";
import { initializeUserSchema, findByEmail, create as createUser } from "../src/lib/db/user-repository";
import { UserRole, UserStatus } from "../src/types/user";

/**
 * Test user configuration for seeding
 */
const TEST_SEEDER_USER = {
  email: "bws-test-seeder@bws-test.com",
  password: "TestPass123!",
  name: "Test Seeder User",
  role: "user" as UserRole,
  status: "active" as UserStatus,
};

/**
 * Get or create test seeder user
 * Ensures foreign key constraint can be satisfied
 */
async function getOrCreateSeederUser(client: PoolClient): Promise<string> {
  // Try to find existing user
  const existingUser = await findByEmail(TEST_SEEDER_USER.email);

  if (existingUser) {
    console.log(`[OK] Test seeder user exists: ${existingUser.email} (ID: ${existingUser.id})`);
    return existingUser.id;
  }

  // Create new user if not found
  console.log(`Creating test seeder user: ${TEST_SEEDER_USER.email}...`);
  const passwordHash = await hashPassword(TEST_SEEDER_USER.password);

  const newUser = await createUser(
    TEST_SEEDER_USER.email,
    passwordHash,
    TEST_SEEDER_USER.name,
    TEST_SEEDER_USER.role,
    TEST_SEEDER_USER.status
  );

  console.log(`[OK] Test seeder user created: ${newUser.email} (ID: ${newUser.id})`);
  return newUser.id;
}

/**
 * Main seed function
 */
async function seedBusinessesScript(): Promise<void> {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");

  // Connect to database
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    database: process.env.POSTGRES_DB || "black_owned",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
  });

  const client = await pool.connect();

  try {
    console.log("Starting business seeding...");
    console.log(`Mode: ${reset ? "reset + seed" : "idempotent seed"}`);

    // Initialize user schema first (required for foreign key)
    console.log("Initializing user schema...");
    await initializeUserSchema();

    // Initialize business schema
    console.log("Initializing business schema...");
    await initializeBusinessSchema(client);

    // Get or create test seeder user (satisfies owner_id FK constraint)
    const ownerId = await getOrCreateSeederUser(client);

    // Check existing count
    const existingCount = await countTestBusinesses(client);
    if (existingCount > 0 && !reset) {
      console.log(`Found ${existingCount} existing test businesses`);
    }

    // Seed businesses with valid owner_id
    const result = await seedBusinesses(client, ownerId, reset);

    console.log("\n========== Seed Summary ==========");
    console.log(`Businesses created: ${result.created}`);
    console.log(`Businesses skipped: ${result.skipped}`);
    console.log(`Total businesses:   ${result.total}`);
    console.log("===================================");

    printCategoryDistribution();

    // Final count
    const finalCount = await countTestBusinesses(client);
    console.log(`\nTotal test businesses in database: ${finalCount}`);

    // Verify foreign key integrity
    console.log("\n=== Foreign Key Verification ===");
    const tableName = getTableName();
    const fkCheck = await client.query(`
      SELECT COUNT(*) as violation_count
      FROM ${tableName} b
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.owner_id)
    `);
    const violations = parseInt((fkCheck.rows[0] as { violation_count: string }).violation_count, 10);
    if (violations === 0) {
      console.log("[PASS] All foreign key relationships are valid");
    } else {
      console.log(`[FAIL] Found ${violations} foreign key violations`);
      process.exit(1);
    }

  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the seed script only when executed directly (not when imported for testing)
const isMainModule = process.argv[1] && process.argv[1].includes("seed-businesses.ts");
if (isMainModule) {
  seedBusinessesScript().catch((error) => {
    console.error("Fatal error running seed script:", error);
    process.exit(1);
  });
}

export { seedBusinessesScript };
