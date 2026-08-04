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
  type UserRole,
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

    it("includes address field for each business", () => {
      const businesses = generateTestBusinesses(5);
      businesses.forEach((biz) => {
        expect(biz.address).toBeDefined();
        expect(typeof biz.address).toBe("string");
        expect(biz.address!.length).toBeGreaterThan(0);
      });
    });

    it("includes category field for each business", () => {
      const businesses = generateTestBusinesses(5);
      businesses.forEach((biz) => {
        expect(biz.category).toBeDefined();
      });
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

    it("assigns roles to all users", () => {
      const users = generateTestUsers(5);
      users.forEach((user) => {
        expect(user.role).toBeDefined();
        expect(["customer", "business_owner", "admin"]).toContain(user.role);
      });
    });

    it("creates default distribution: 2 customers, 2 business owners, 1 admin", () => {
      const users = generateTestUsers(5);
      const roleCounts = {
        customer: 0,
        business_owner: 0,
        admin: 0,
      };
      users.forEach((user) => {
        roleCounts[user.role as UserRole]++;
      });
      expect(roleCounts.customer).toBe(2);
      expect(roleCounts.business_owner).toBe(2);
      expect(roleCounts.admin).toBe(1);
    });

    it("associates business owners with businesses when provided", () => {
      const businesses = [
        { id: "biz-1", name: "Test Biz 1", formattedName: "BWS-TEST: Test Biz 1", address: "123 Test St", category: "food-dining" },
        { id: "biz-2", name: "Test Biz 2", formattedName: "BWS-TEST: Test Biz 2", address: "456 Test Ave", category: "retail-fashion" },
      ];
      const users = generateTestUsers(5, businesses);
      const businessOwners = users.filter((u) => u.role === "business_owner");
      businessOwners.forEach((owner) => {
        expect(owner.associatedBusinessId).toBeDefined();
        expect(["biz-1", "biz-2"]).toContain(owner.associatedBusinessId);
      });
    });

    it("customers and admin do not have associated business IDs", () => {
      const businesses = [
        { id: "biz-1", name: "Test Biz 1", formattedName: "BWS-TEST: Test Biz 1", address: "123 Test St", category: "food-dining" },
      ];
      const users = generateTestUsers(5, businesses);
      const nonOwners = users.filter((u) => u.role !== "business_owner");
      nonOwners.forEach((user) => {
        expect(user.associatedBusinessId).toBeUndefined();
      });
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

    it("creates exactly 5 users with correct role distribution (2 customers, 2 business owners, 1 admin)", () => {
      const data = generateTestSeedData(5, 5);
      expect(data.users).toHaveLength(5);
      const roleCounts = {
        customer: 0,
        business_owner: 0,
        admin: 0,
      };
      data.users.forEach((user) => {
        roleCounts[user.role as UserRole]++;
      });
      expect(roleCounts.customer).toBe(2);
      expect(roleCounts.business_owner).toBe(2);
      expect(roleCounts.admin).toBe(1);
    });

    it("associates business owners with seeded businesses", () => {
      const data = generateTestSeedData(5, 5);
      expect(data.businesses).toHaveLength(5);
      const businessOwners = data.users.filter((u) => u.role === "business_owner");
      expect(businessOwners).toHaveLength(2);
      businessOwners.forEach((owner) => {
        expect(owner.associatedBusinessId).toBeDefined();
        const associatedBiz = data.businesses.find((b) => b.id === owner.associatedBusinessId);
        expect(associatedBiz).toBeDefined();
      });
    });
  });
});
