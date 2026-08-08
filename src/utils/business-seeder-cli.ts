/**
 * Business Seeder CLI
 *
 * Command-line interface for seeding sample businesses.
 *
 * Usage:
 *   npm run seed:businesses           # Seed 20 businesses
 *   npm run seed:businesses:reset     # Clear and reseed
 */

import { Pool, PoolClient } from "pg";
import { seedBusinesses, countTestBusinesses, printCategoryDistribution } from "./business-seeder";
import { initializeBusinessSchema } from "../lib/db/business-repository";

async function main(): Promise<void> {
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

    // Initialize schema if needed
    await initializeBusinessSchema(client);

    // Check existing count
    const existingCount = await countTestBusinesses(client);
    if (existingCount > 0 && !reset) {
      console.log(`Found ${existingCount} existing test businesses`);
    }

    // Create a test user if needed (for owner_id requirement)
    const testEmail = "bws-test-seeder@bws-test.com";
    const { hashPassword } = await import("../lib/auth/auth-service");

    // Try to get or create test user
    let userIdResult = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [testEmail]
    );

    if (userIdResult.rows.length === 0) {
      const passwordHash = await hashPassword("TestPass123!");
      userIdResult = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id",
        [testEmail, passwordHash, "Test Seeder User"]
      );
    }

    const ownerId = userIdResult.rows[0].id;

    // Seed businesses
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

  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}

export { main };
