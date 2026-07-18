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
  generateBusinessesWithImages,
  BUSINESS_CATEGORIES,
  BUSINESS_TEMPLATES_BY_CATEGORY,
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

  describe("generateBusinessesWithImages", () => {
    it("generates 30 businesses with images by default", () => {
      const results = generateBusinessesWithImages();
      expect(results).toHaveLength(30);
    });

    it("generates specified number of businesses with images", () => {
      const results = generateBusinessesWithImages(15);
      expect(results).toHaveLength(15);
    });

    it("each business has 2-4 images", () => {
      const results = generateBusinessesWithImages(30);
      results.forEach((result) => {
        expect(result.images.images.length).toBeGreaterThanOrEqual(2);
        expect(result.images.images.length).toBeLessThanOrEqual(4);
      });
    });

    it("each business has unique ID", () => {
      const results = generateBusinessesWithImages(30);
      const ids = results.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(30);
    });

    it("all images are associated with correct business ID via foreign key", () => {
      const results = generateBusinessesWithImages(30);
      results.forEach((result) => {
        result.images.images.forEach((image: { businessId: string }) => {
          expect(image.businessId).toBe(result.id);
        });
      });
    });

    it("each image has descriptive alt text", () => {
      const results = generateBusinessesWithImages(30);
      results.forEach((result) => {
        result.images.images.forEach((image: { altText: string }) => {
          expect(image.altText).toBeDefined();
          expect(image.altText.length).toBeGreaterThanOrEqual(10);
        });
      });
    });

    it("alt text matches business category", () => {
      const results = generateBusinessesWithImages(30);
      results.forEach((result) => {
        result.images.images.forEach((image: { category: string }) => {
          expect(image.category).toBe(result.category);
        });
      });
    });

    it("all businesses have BWS-TEST prefix", () => {
      const results = generateBusinessesWithImages(30);
      results.forEach((result) => {
        expect(isTestBusiness(result.formattedName)).toBe(true);
      });
    });

    it("covers all 10 categories", () => {
      const results = generateBusinessesWithImages(30);
      const categories = new Set(results.map((r) => r.category));
      expect(categories.size).toBe(10);
    });

    it("each category has 3 businesses", () => {
      const results = generateBusinessesWithImages(30);
      const categoryCounts: Record<string, number> = {};

      results.forEach((result) => {
        const cat = result.category || "unknown";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });

      BUSINESS_CATEGORIES.forEach((category) => {
        expect(categoryCounts[category]).toBe(3);
      });
    });
  });
});
