/**
 * Admin User Seeder
 *
 * Creates an admin test user for development/testing purposes.
 *
 * Usage:
 *   npx ts-node src/utils/admin-user-seeder.ts
 *
 * Test User Credentials (documented per AC requirements):
 *   Email: admin-test@bws-test@domain.com
 *   Password: AdminTestPass123!
 *   Role: admin
 *
 * Note: These credentials are for development/testing only.
 *       Do not use in production environments.
 */

import { Pool } from "pg";
import { initializeUserSchema } from "../lib/db/user-repository";
import { formatUserEmail, TEST_EMAIL_DOMAIN } from "./test-data-seeder";

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

    // Admin test user credentials (documented per AC requirements)
    const adminEmail = formatUserEmail("admin-test");
    const adminPassword = "AdminTestPass123!";

    console.log(`Checking for existing admin test user: ${adminEmail}`);

    // Check if user already exists
    const existingUser = await client.query(
      "SELECT * FROM users WHERE email = $1",
      [adminEmail]
    );

    if (existingUser.rows.length > 0) {
      console.log(`Admin test user already exists: ${adminEmail}`);
      console.log("User ID:", existingUser.rows[0].id);
      return;
    }

    // Import password hashing utility
    const { hashPassword } = await import("../lib/auth/auth-service");

    // Hash the password
    const passwordHash = await hashPassword(adminPassword);

    // Create admin user
    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, role, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [adminEmail, passwordHash, "Admin Test User", "admin", "active"]
    );

    const user = result.rows[0];

    console.log("\n========== Admin Test User Created ==========");
    console.log(`User ID: ${user.id}`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Name: Admin Test User`);
    console.log(`Role: admin`);
    console.log(`Status: active`);
    console.log("\n--- Credentials (for testing only) ---");
    console.log(`Password: ${adminPassword}`);
    console.log("-----------------------------------------");

  } catch (error) {
    console.error("Failed to create admin user:", error);
    process.exit(1);
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
