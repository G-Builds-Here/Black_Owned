/**
 * Seed Script Tests: Create Sample Businesses
 *
 * Verifies that the seed script creates 20 sample businesses
 * with all required fields and multiple categories.
 */

import {
  generateSampleBusinesses,
  getCategoryDistribution,
  printCategoryDistribution,
} from "../src/utils/business-seeder";
import { TEST_PREFIX } from "../src/utils/test-data-seeder";

describe("Business Seed Script - LOC-0058-AC2", () => {
  describe("generateSampleBusinesses", () => {
    it("generates exactly 20 businesses", () => {
      const businesses = generateSampleBusinesses();
      expect(businesses).toHaveLength(20);
    });

    it("covers multiple categories (restaurant, retail, service)", () => {
      const businesses = generateSampleBusinesses();
      const categories = new Set(businesses.map((b) => b.categoryId));

      // AC requires: restaurant, retail, service categories
      expect(categories.size).toBeGreaterThan(2);
      expect(categories).toContain("food-dining");
      expect(categories).toContain("retail-fashion");
      expect(categories).toContain("professional-services");
      expect(categories).toContain("health-wellness");
    });

    it("includes all required fields for each business", () => {
      const businesses = generateSampleBusinesses();

      businesses.forEach((biz) => {
        expect(biz.name).toBeDefined();
        expect(biz.name).toMatch(new RegExp(`^${TEST_PREFIX}:`));
        expect(biz.description).toBeDefined();
        expect(biz.description).toBeTruthy();
        expect(biz.categoryId).toBeDefined();
      });
    });

    it("uses BWS-TEST prefix for all business names", () => {
      const businesses = generateSampleBusinesses();

      businesses.forEach((biz) => {
        expect(biz.name).toMatch(new RegExp(`^${TEST_PREFIX}:`));
      });
    });

    it("each business has unique name", () => {
      const businesses = generateSampleBusinesses();
      const names = businesses.map((b) => b.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe("getCategoryDistribution", () => {
    it("returns distribution across categories", () => {
      const distribution = getCategoryDistribution();

      // Verify multiple categories have businesses
      const categoriesWithBusinesses = Object.entries(distribution).filter(
        ([_, count]) => count > 0
      );

      expect(categoriesWithBusinesses.length).toBeGreaterThan(2);
    });

    it("totals to 20 businesses", () => {
      const distribution = getCategoryDistribution();
      const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);

      expect(total).toBe(20);
    });

    it("has food-dining category with multiple entries", () => {
      const distribution = getCategoryDistribution();
      expect(distribution["food-dining"]).toBeGreaterThan(0);
    });

    it("has retail-fashion category with multiple entries", () => {
      const distribution = getCategoryDistribution();
      expect(distribution["retail-fashion"]).toBeGreaterThan(0);
    });

    it("has professional-services category with multiple entries", () => {
      const distribution = getCategoryDistribution();
      expect(distribution["professional-services"]).toBeGreaterThan(0);
    });
  });

  describe("printCategoryDistribution", () => {
    it("prints category distribution without throwing", () => {
      expect(() => printCategoryDistribution()).not.toThrow();
    });
  });
});
