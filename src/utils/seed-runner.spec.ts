/**
 * Tests for Seed Runner - Idempotency Validation
 *
 * AC6 Requirements:
 * - Given the seed script has already been executed once
 * - When the seed script is executed again
 * - Then no duplicate businesses, reviews, images, or users are created
 * - And the script completes without errors
 * - And the output shows a summary
 */

import {
  runSeed,
  printSummary,
  clearTestData,
  hasTestData,
  countTestBusinesses,
  countTestUsers,
  businessExists,
  userExists,
  SeedSummary,
  db,
} from "./seed-runner";
import { TEST_PREFIX } from "./test-data-seeder";

describe("Seed Runner - Idempotency", () => {
  beforeEach(() => {
    // Clear database before each test to ensure clean state
    clearTestData();
  });

  describe("First Run - Initial Seeding", () => {
    let summary: SeedSummary;

    beforeAll(async () => {
      summary = await runSeed(false);
    });

    it("creates 30 businesses on first run", () => {
      expect(summary.businessesCreated).toBe(30);
      expect(summary.businessesSkipped).toBe(0);
    });

    it("creates reviews for all businesses", () => {
      // Each business gets 3-5 reviews, so 30 businesses should get reviews
      expect(summary.reviewsCreated).toBe(30);
      expect(summary.reviewsSkipped).toBe(0);
    });

    it("creates images for all businesses", () => {
      // Each business gets 2-4 images
      expect(summary.imagesCreated).toBeGreaterThanOrEqual(30 * 2);
      expect(summary.imagesCreated).toBeLessThanOrEqual(30 * 4);
      expect(summary.imagesSkipped).toBe(0);
    });

    it("creates 10 users on first run", () => {
      expect(summary.usersCreated).toBe(10);
      expect(summary.usersSkipped).toBe(0);
    });

    it("completes without errors", () => {
      expect(summary.totalRuntime).toBeDefined();
      expect(summary.totalRuntime).toMatch(/\d+ms/);
    });
  });

  describe("Second Run - Idempotency Check", () => {
    let firstRunSummary: SeedSummary;
    let secondRunSummary: SeedSummary;

    beforeAll(async () => {
      firstRunSummary = await runSeed(false);
      secondRunSummary = await runSeed(false);
    });

    it("skips all businesses on second run", () => {
      expect(secondRunSummary.businessesCreated).toBe(0);
      expect(secondRunSummary.businessesSkipped).toBe(30);
    });

    it("skips all reviews on second run", () => {
      expect(secondRunSummary.reviewsCreated).toBe(0);
      expect(secondRunSummary.reviewsSkipped).toBe(30);
    });

    it("skips all images on second run", () => {
      expect(secondRunSummary.imagesCreated).toBe(0);
      expect(secondRunSummary.imagesSkipped).toBeGreaterThan(0);
    });

    it("skips all users on second run", () => {
      expect(secondRunSummary.usersCreated).toBe(0);
      expect(secondRunSummary.usersSkipped).toBe(10);
    });

    it("completes without errors on second run", () => {
      expect(secondRunSummary.totalRuntime).toBeDefined();
      expect(secondRunSummary.totalRuntime).toMatch(/\d+ms/);
    });

    it("does not create duplicate data", () => {
      // Total created across both runs should equal first run
      expect(firstRunSummary.businessesCreated + secondRunSummary.businessesCreated).toBe(30);
      expect(firstRunSummary.usersCreated + secondRunSummary.usersCreated).toBe(10);
    });
  });

  describe("Reset Flag", () => {
    it("clears data when reset flag is used", async () => {
      // First run
      await runSeed(false);
      const countAfterFirst = countTestBusinesses();
      expect(countAfterFirst).toBe(30);

      // Reset and seed again
      const resetSummary = await runSeed(true);
      expect(resetSummary.businessesCreated).toBe(30);
      expect(resetSummary.businessesSkipped).toBe(0);
    });

    it("allows re-seeding after reset", async () => {
      await runSeed(false);
      await runSeed(true); // Reset and re-seed

      const count = countTestBusinesses();
      expect(count).toBe(30); // Should still be 30, not 60
    });
  });

  describe("hasTestData", () => {
    it("returns false for empty database", () => {
      clearTestData();
      expect(hasTestData()).toBe(false);
    });

    it("returns true after seeding", async () => {
      await runSeed(false);
      expect(hasTestData()).toBe(true);
    });
  });

  describe("businessExists", () => {
    it("returns false for non-existent business", () => {
      clearTestData();
      expect(businessExists("BWS-TEST: Non Existent")).toBe(false);
    });

    it("returns true for existing business", async () => {
      await runSeed(false);
      expect(businessExists(`${TEST_PREFIX}: Soul Food Kitchen`)).toBe(true);
    });
  });

  describe("userExists", () => {
    it("returns false for non-existent user", () => {
      clearTestData();
      expect(userExists("nonexistent@bws-test@domain.com")).toBe(false);
    });

    it("returns true for existing user", async () => {
      await runSeed(false);
      // John Doe is the first template, becomes john1-doe when count > 5
      expect(userExists("john1-doe@bws-test@domain.com")).toBe(true);
    });
  });

  describe("printSummary", () => {
    it("prints summary without errors", () => {
      const mockSummary: SeedSummary = {
        businessesCreated: 30,
        businessesSkipped: 0,
        reviewsCreated: 30,
        reviewsSkipped: 0,
        imagesCreated: 90,
        imagesSkipped: 0,
        usersCreated: 10,
        usersSkipped: 0,
        totalRuntime: "150ms",
      };

      // Should not throw
      expect(() => printSummary(mockSummary)).not.toThrow();
    });
  });

  describe("Idempotency - Multiple Runs", () => {
    it("creates data only on first of 5 consecutive runs", async () => {
      const summaries: SeedSummary[] = [];

      for (let i = 0; i < 5; i++) {
        summaries.push(await runSeed(false));
      }

      // First run creates everything
      expect(summaries[0].businessesCreated).toBe(30);
      expect(summaries[0].businessesSkipped).toBe(0);

      // Subsequent runs skip everything
      for (let i = 1; i < 5; i++) {
        expect(summaries[i].businessesCreated).toBe(0);
        expect(summaries[i].businessesSkipped).toBe(30);
      }
    });

    it("maintains consistent data count across multiple runs", async () => {
      await runSeed(false);
      await runSeed(false);
      await runSeed(false);

      const businessCount = countTestBusinesses();
      const userCount = countTestUsers();

      expect(businessCount).toBe(30);
      expect(userCount).toBe(10);
    });
  });
});
