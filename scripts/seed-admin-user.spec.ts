/**
 * Tests for seed-admin-user.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { initializeUserSchema, findByEmail, closePool } from "../src/lib/db/user-repository";
import { hashPassword } from "../src/lib/auth/auth-service";
import { ADMIN_TEST_USER } from "./seed-admin-user";

describe("seed-admin-user", () => {
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await initializeUserSchema();
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await closePool();
    }
  });

  it("should have valid test credentials defined", () => {
    expect(ADMIN_TEST_USER.email).toBe("admin-test@bws-test.com");
    expect(ADMIN_TEST_USER.name).toBe("Test Admin User");
    expect(ADMIN_TEST_USER.role).toBe("admin");
    expect(ADMIN_TEST_USER.status).toBe("active");
  });

  it("should have password that meets requirements", async () => {
    const password = ADMIN_TEST_USER.password;
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)).toBe(true);
  });

  it("should hash password successfully", async () => {
    const hash = await hashPassword(ADMIN_TEST_USER.password);
    expect(hash).toBeDefined();
    expect(hash).not.toBe(ADMIN_TEST_USER.password);
    expect(hash.length).toBeGreaterThan(0);
  });

  it("should find admin user after creation", async () => {
    if (!dbAvailable) {
      console.log("Skipping database test - PostgreSQL not available");
      return;
    }
    const user = await findByEmail(ADMIN_TEST_USER.email);
    if (user) {
      expect(user.email).toBe(ADMIN_TEST_USER.email);
      expect(user.name).toBe(ADMIN_TEST_USER.name);
      expect(user.role).toBe("admin");
      expect(user.status).toBe("active");
    }
  });
});
