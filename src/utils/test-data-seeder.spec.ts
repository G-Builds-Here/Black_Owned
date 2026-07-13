/**
 * Tests for Test Data Seeder utilities
 *
 * Verifies that all test data is properly marked with BWS-TEST prefixes
 * and follows the required naming conventions.
 */

import {
  TEST_PREFIX,
  TEST_EMAIL_DOMAIN,
  formatBusinessName,
  formatUserEmail,
  isTestBusiness,
  isTestEmail,
  generateTestBusinesses,
  generateTestUsers,
  generateTestSeedData,
} from "./test-data-seeder";

describe("Test Data Seeder", () => {
  describe("formatBusinessName", () => {
    it("prepends BWS-TEST prefix to business names", () => {
      const result = formatBusinessName("My Business");
      expect(result).toBe("BWS-TEST: My Business");
    });

    it("handles special characters in business names", () => {
      const result = formatBusinessName("Joe's & Mary's Shop");
      expect(result).toBe("BWS-TEST: Joe's & Mary's Shop");
    });
  });

  describe("formatUserEmail", () => {
    it("creates email with bws-test@domain.com pattern", () => {
      const result = formatUserEmail("John Doe");
      expect(result).toBe("john-doe@bws-test@domain.com");
    });

    it("normalizes email slugs to lowercase", () => {
      const result = formatUserEmail("JANE SMITH");
      expect(result).toBe("jane-smith@bws-test@domain.com");
    });

    it("removes special characters from email slugs", () => {
      const result = formatUserEmail("O'Brien");
      expect(result).toBe("o-brien@bws-test@domain.com");
    });
  });

  describe("isTestBusiness", () => {
    it("returns true for BWS-TEST prefixed names", () => {
      expect(isTestBusiness("BWS-TEST: My Store")).toBe(true);
    });

    it("returns false for regular business names", () => {
      expect(isTestBusiness("My Store")).toBe(false);
    });

    it("returns false for similar but non-test prefixes", () => {
      expect(isTestBusiness("TEST: My Store")).toBe(false);
      expect(isTestBusiness("BWS: My Store")).toBe(false);
    });
  });

  describe("isTestEmail", () => {
    it("returns true for bws-test@domain.com emails", () => {
      expect(isTestEmail("user@bws-test@domain.com")).toBe(true);
    });

    it("returns false for regular emails", () => {
      expect(isTestEmail("user@example.com")).toBe(false);
    });

    it("returns false for similar but non-test domains", () => {
      expect(isTestEmail("user@test@domain.com")).toBe(false);
    });
  });

  describe("generateTestBusinesses", () => {
    it("generates specified number of test businesses", () => {
      const businesses = generateTestBusinesses(3);
      expect(businesses).toHaveLength(3);
    });

    it("all generated businesses have BWS-TEST prefix", () => {
      const businesses = generateTestBusinesses(10);
      businesses.forEach((biz) => {
        expect(biz.formattedName).toMatch(/^BWS-TEST:/);
        expect(isTestBusiness(biz.formattedName)).toBe(true);
      });
    });

    it("includes both original and formatted names", () => {
      const businesses = generateTestBusinesses(1);
      expect(businesses[0].name).toBeDefined();
      expect(businesses[0].formattedName).toBeDefined();
      expect(businesses[0].formattedName).toContain(businesses[0].name);
    });
  });

  describe("generateTestUsers", () => {
    it("generates specified number of test users", () => {
      const users = generateTestUsers(3);
      expect(users).toHaveLength(3);
    });

    it("all generated users have bws-test@domain.com emails", () => {
      const users = generateTestUsers(10);
      users.forEach((user) => {
        expect(user.formattedEmail).toMatch(/@bws-test@domain\.com$/);
        expect(isTestEmail(user.formattedEmail)).toBe(true);
      });
    });

    it("includes first and last names", () => {
      const users = generateTestUsers(1);
      expect(users[0].firstName).toBeDefined();
      expect(users[0].lastName).toBeDefined();
    });
  });

  describe("generateTestSeedData", () => {
    it("generates complete seed data with businesses and users", () => {
      const data = generateTestSeedData(5, 3);
      expect(data.businesses).toHaveLength(5);
      expect(data.users).toHaveLength(3);
    });

    it("all businesses are properly marked", () => {
      const data = generateTestSeedData(5, 5);
      data.businesses.forEach((biz) => {
        expect(isTestBusiness(biz.formattedName)).toBe(true);
      });
    });

    it("all users are properly marked", () => {
      const data = generateTestSeedData(5, 5);
      data.users.forEach((user) => {
        expect(isTestEmail(user.formattedEmail)).toBe(true);
      });
    });
  });
});
