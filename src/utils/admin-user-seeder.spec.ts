/**
 * Tests for Admin User Seeder
 *
 * Verifies that the admin test user is created with correct credentials
 * and follows the BWS-TEST naming conventions.
 */

import { formatUserEmail, TEST_EMAIL_DOMAIN } from "./test-data-seeder";

describe("Admin User Seeder", () => {
  const adminEmail = formatUserEmail("admin-test");
  const expectedPassword = "AdminTestPass123!";

  describe("Admin user credentials", () => {
    it("admin email follows bws-test@domain.com pattern", () => {
      expect(adminEmail).toMatch(/@bws-test@domain\.com$/);
    });

    it("admin email uses correct slug format", () => {
      expect(adminEmail).toBe("admin-test@bws-test@domain.com");
    });

    it("admin password meets complexity requirements", () => {
      // Password should have uppercase, lowercase, number, special char, min 8 chars
      const hasUppercase = /[A-Z]/.test(expectedPassword);
      const hasLowercase = /[a-z]/.test(expectedPassword);
      const hasNumber = /\d/.test(expectedPassword);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(expectedPassword);
      const hasMinLength = expectedPassword.length >= 8;

      expect(hasUppercase).toBe(true);
      expect(hasLowercase).toBe(true);
      expect(hasNumber).toBe(true);
      expect(hasSpecial).toBe(true);
      expect(hasMinLength).toBe(true);
    });
  });

  describe("Test user identification", () => {
    it("admin email ends with test domain", () => {
      expect(adminEmail).toBe(`admin-test@${TEST_EMAIL_DOMAIN}`);
    });

    it("admin user can be identified as test data", () => {
      // Verify the email pattern matches test user detection
      const isTestEmail = adminEmail.endsWith(`@${TEST_EMAIL_DOMAIN}`);
      expect(isTestEmail).toBe(true);
    });
  });

  describe("Documentation requirements", () => {
    it("credentials are documented in source file comments", () => {
      // Read the source file and verify credentials are documented
      const fs = require("fs");
      const path = require("path");
      const sourceFile = fs.readFileSync(
        path.join(__dirname, "admin-user-seeder.ts"),
        "utf8"
      );

      // Check for documented email
      expect(sourceFile).toContain(adminEmail);
      expect(sourceFile).toContain(expectedPassword);

      // Check for role documentation
      expect(sourceFile).toContain("admin");

      // Check for warning about production use
      expect(sourceFile.toLowerCase()).toContain("production");
    });
  });
});
