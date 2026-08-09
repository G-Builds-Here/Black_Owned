/**
 * Admin User Seeder
 *
 * Creates an admin test user for development/testing purposes.
 *
 * Usage:
 *   npx ts-node src/utils/admin-user-seeder.ts
 *
 * Test User Credentials (documented per AC requirements):
 *   Email: admin-test@bws-test.domain.com
 *   Password: AdminTestPass123!
 *   Role: admin
 *
 * Note: These credentials are for development/testing only.
 *       Do not use in production environments.
 */

import { Pool } from "pg";
import { initializeUserSchema } from "../lib/db/user-repository";
import { formatUserEmail, TEST_EMAIL_DOMAIN } from "./test-data-seeder";

/**
 * Admin user credentials (documented per AC requirements)
 */
export const ADMIN_TEST_EMAIL = formatUserEmail("admin-test");
export const ADMIN_TEST_PASSWORD = "AdminTestPass123!";

async function createAdminUser(): Promise<void> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    database: process.env.POSTGRES_DB || "black_owned",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
  });

  const client = await pool.connect();

  try {
    console.log("Starting admin user seed...");

    // Initialize schema if needed
    await initializeUserSchema();

    console.log(`Checking for existing admin test user: ${ADMIN_TEST_EMAIL}`);

    // Check if user already exists
    const existingUser = await client.query(
      "SELECT * FROM users WHERE email = $1",
      [ADMIN_TEST_EMAIL]
    );

    if (existingUser.rows.length > 0) {
      console.log(`Admin test user already exists: ${ADMIN_TEST_EMAIL}`);
      console.log("User ID:", existingUser.rows[0].id);
      return;
    }

    // Import password hashing utility
    const { hashPassword } = await import("../lib/auth/auth-service");

    // Hash the password
    const passwordHash = await hashPassword(ADMIN_TEST_PASSWORD);

    // Create admin user
    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, role, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [ADMIN_TEST_EMAIL, passwordHash, "Admin Test User", "admin", "active"]
    );

    const user = result.rows[0];

    console.log("\n========== Admin Test User Created ==========");
    console.log(`User ID: ${user.id}`);
    console.log(`Email: ${ADMIN_TEST_EMAIL}`);
    console.log(`Name: Admin Test User`);
    console.log(`Role: admin`);
    console.log(`Status: active`);
    console.log("\n--- Credentials (for testing only) ---");
    console.log(`Password: ${ADMIN_TEST_PASSWORD}`);
    console.log("-----------------------------------------");

  } catch (error) {
    console.error("Failed to create admin user:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  createAdminUser().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}

export { createAdminUser };
