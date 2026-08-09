/**
 * Seed Script: Create Admin Test User
 *
 * This script creates a test admin user for development and testing.
 *
 * Usage:
 *   npx tsx scripts/seed-admin-user.ts
 *
 * Test Admin Credentials:
 *   Email:    admin-test@bws-test.com
 *   Password: TestAdmin1! (meets password requirements: 8+ chars, uppercase, lowercase, digit, special char)
 *
 * IMPORTANT: These credentials are for testing only. Do not use in production.
 */

import { create, initializeUserSchema, findByEmail } from "../src/lib/db/user-repository";
import { hashPassword } from "../src/lib/auth/auth-service";
import { UserRole, UserStatus } from "../src/types/user";

/**
 * Admin test user configuration
 */
export const ADMIN_TEST_USER = {
  email: "admin-test@bws-test.com",
  password: "TestAdmin1!",
  name: "Test Admin User",
  role: "admin" as UserRole,
  status: "active" as UserStatus,
};

/**
 * Main seed function
 */
async function seedAdminUser(): Promise<void> {
  console.log("Initializing user schema...");
  await initializeUserSchema();

  console.log(`Checking for existing user: ${ADMIN_TEST_USER.email}...`);
  const existingUser = await findByEmail(ADMIN_TEST_USER.email);

  if (existingUser) {
    console.log(`[SKIP] Admin user already exists: ${existingUser.email} (ID: ${existingUser.id})`);
    console.log("\n--- Admin Test User Credentials ---");
    console.log(`Email:    ${existingUser.email}`);
    console.log(`Password: ${ADMIN_TEST_USER.password}`);
    console.log("===================================\n");
    return;
  }

  console.log("Hashing password...");
  const passwordHash = await hashPassword(ADMIN_TEST_USER.password);

  console.log(`Creating admin user: ${ADMIN_TEST_USER.name}...`);
  const adminUser = await create(
    ADMIN_TEST_USER.email,
    passwordHash,
    ADMIN_TEST_USER.name,
    ADMIN_TEST_USER.role,
    ADMIN_TEST_USER.status
  );

  console.log("\n--- Admin Test User Created ---");
  console.log(`ID:       ${adminUser.id}`);
  console.log(`Email:    ${adminUser.email}`);
  console.log(`Name:     ${adminUser.name}`);
  console.log(`Role:     ${adminUser.role}`);
  console.log(`Status:   ${adminUser.status}`);
  console.log("\n--- Test Credentials ---");
  console.log(`Email:    ${ADMIN_TEST_USER.email}`);
  console.log(`Password: ${ADMIN_TEST_USER.password}`);
  console.log("================================\n");
}

// Run the seed script only when executed directly (not when imported for testing)
const isMainModule = process.argv[1] && process.argv[1].includes("seed-admin-user.ts");
if (isMainModule) {
  seedAdminUser().catch((error) => {
    console.error("Fatal error running seed script:", error);
    process.exit(1);
  });
}
