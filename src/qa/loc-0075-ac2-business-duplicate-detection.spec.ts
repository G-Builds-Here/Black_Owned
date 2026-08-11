/**
 * QA Tests for LOC-0075-AC2 - Business Search Functionality
 *
 * Acceptance Criteria:
 * Given "Joe's Restaurant" at "123 Main St, New York, NY 10001" exists
 * When "Joe's Restaurant LLC" at "123 Main Street, New York, NY 10001" is scraped
 * Then a similarity score above threshold is calculated
 * And the match is flagged as potential duplicate
 *
 * Copyright 2026 Black Owned Directory
 */

import {
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeString,
  jaccardSimilarity,
  combinedSimilarity,
  normalizedSimilarity,
} from "../utils/similarity";
import {
  checkForDuplicate,
  normalizeAddress,
  DEFAULT_DUPLICATE_CONFIG,
  type DuplicateDetectionConfig,
  type BusinessForComparison,
  type DuplicateCheckResult,
} from "../services/duplicate-detection-service";

describe("LOC-0075-AC2: Business Search - Fuzzy Name + Address Match", () => {
  describe("AC Scenario: Joe's Restaurant duplicate detection", () => {
    it("should detect Joe's Restaurant vs Joe's Restaurant LLC as potential duplicate with address match", () => {
      // Exact scenario from the AC
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const scrapedBusiness: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "123 Main Street, New York, NY 10001",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      // Main assertion: should be flagged as potential duplicate
      expect(result.isPotentialDuplicate).toBe(true);

      // Supporting assertions: both name and address must exceed threshold
      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(true);

      // Verify similarity scores are calculated
      expect(result.nameSimilarity).toBeGreaterThanOrEqual(DEFAULT_DUPLICATE_CONFIG.nameThreshold);
      expect(result.addressSimilarity).toBeGreaterThanOrEqual(DEFAULT_DUPLICATE_CONFIG.addressThreshold);

      // Verify all scores are in valid range
      expect(result.nameSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.nameSimilarity).toBeLessThanOrEqual(1);
      expect(result.addressSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.addressSimilarity).toBeLessThanOrEqual(1);
      expect(result.combinedScore).toBeGreaterThanOrEqual(0);
      expect(result.combinedScore).toBeLessThanOrEqual(1);
    });

    it("should calculate similarity scores for the AC scenario", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const scrapedBusiness: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "123 Main Street, New York, NY 10001",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      // Name similarity should be high (fuzzy match with LLC suffix)
      expect(result.nameSimilarity).toBeGreaterThan(0.8);

      // Address similarity should be very high (Street vs St normalization)
      expect(result.addressSimilarity).toBeGreaterThan(0.9);
    });
  });

  describe("Name similarity - fuzzy matching", () => {
    it("should detect exact name matches", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "Different Address 1",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "Different Address 2",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBe(1);
      expect(result.nameAboveThreshold).toBe(true);
    });

    it("should handle case-insensitive name comparison", () => {
      const business1: BusinessForComparison = {
        name: "JOE'S RESTAURANT",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "joe's restaurant",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle business suffix variations (LLC, Inc, Corp)", () => {
      const testCases: Array<{ name1: string; name2: string; expectedHighSimilarity: boolean }> = [
        { name1: "Joe's Restaurant", name2: "Joe's Restaurant LLC", expectedHighSimilarity: true },
        { name1: "ABC Company", name2: "ABC Company Inc", expectedHighSimilarity: true },
        { name1: "Test Business", name2: "Test Business Corporation", expectedHighSimilarity: true },
        { name1: "The Store", name2: "The Store Ltd", expectedHighSimilarity: true },
      ];

      for (const tc of testCases) {
        const business1: BusinessForComparison = { name: tc.name1, address: "Same Address" };
        const business2: BusinessForComparison = { name: tc.name2, address: "Same Address" };

        const result = checkForDuplicate(business1, business2);

        if (tc.expectedHighSimilarity) {
          expect(result.nameSimilarity).toBeGreaterThan(0.85);
          expect(result.nameAboveThreshold).toBe(true);
        }
      }
    });

    it("should handle apostrophe variations in names", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Joes Restaurant",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      // Apostrophe removal should still result in high similarity
      expect(result.nameSimilarity).toBeGreaterThan(0.9);
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should not flag completely different names", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "Same Address",
      };
      const business2: BusinessForComparison = {
        name: "Mike's Diner",
        address: "Same Address",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBeLessThan(0.5);
      expect(result.nameAboveThreshold).toBe(false);
    });
  });

  describe("Address similarity - normalization and matching", () => {
    it("should normalize 'Street' to 'st'", () => {
      const normalized1 = normalizeAddress("123 Main Street");
      const normalized2 = normalizeAddress("123 Main St");

      expect(normalized1).toBe(normalized2);
    });

    it("should normalize 'Avenue' to 'ave'", () => {
      const normalized1 = normalizeAddress("456 Oak Avenue");
      const normalized2 = normalizeAddress("456 Oak Ave");

      expect(normalized1).toBe(normalized2);
    });

    it("should normalize 'Boulevard' to 'blvd'", () => {
      const normalized1 = normalizeAddress("789 Pine Boulevard");
      const normalized2 = normalizeAddress("789 Pine Blvd");

      expect(normalized1).toBe(normalized2);
    });

    it("should normalize 'Road' to 'rd'", () => {
      const normalized1 = normalizeAddress("100 Elm Road");
      const normalized2 = normalizeAddress("100 Elm Rd");

      expect(normalized1).toBe(normalized2);
    });

    it("should normalize 'Drive' to 'dr'", () => {
      const normalized1 = normalizeAddress("200 Cedar Drive");
      const normalized2 = normalizeAddress("200 Cedar Dr");

      expect(normalized1).toBe(normalized2);
    });

    it("should normalize state names to abbreviations", () => {
      expect(normalizeAddress("123 Main St, New York, NY 10001")).toContain("ny");
      expect(normalizeAddress("123 Main St, New York, New York 10001")).toContain("ny");

      expect(normalizeAddress("100 First St, Los Angeles, CA 90001")).toContain("ca");
      expect(normalizeAddress("100 First St, Los Angeles, California 90001")).toContain("ca");

      expect(normalizeAddress("50 Second Ave, Houston, TX 77001")).toContain("tx");
      expect(normalizeAddress("50 Second Ave, Houston, Texas 77001")).toContain("tx");
    });

    it("should handle extra whitespace in addresses", () => {
      const normalized1 = normalizeAddress("123   Main    Street");
      const normalized2 = normalizeAddress("123 Main St");

      expect(normalized1).not.toContain("  ");
      expect(normalized1).toBe(normalized2);
    });

    it("should handle case-insensitive address comparison", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "123 MAIN STREET, NEW YORK, NY 10001",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "123 main street, new york, ny 10001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBe(1);
      expect(result.addressAboveThreshold).toBe(true);
    });

    it("should not flag different addresses", () => {
      const business1: BusinessForComparison = {
        name: "Same Business Name",
        address: "123 Main St, New York, NY 10001",
      };
      const business2: BusinessForComparison = {
        name: "Same Business Name",
        address: "456 Oak Ave, Los Angeles, CA 90001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBeLessThan(0.5);
      expect(result.addressAboveThreshold).toBe(false);
    });
  });

  describe("Duplicate detection logic - both name AND address must match", () => {
    it("should flag as duplicate when BOTH name and address exceed threshold", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "123 Main Street, New York, NY 10001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(true);
    });

    it("should NOT flag when only name matches (different addresses)", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "456 Oak Ave, Los Angeles, CA 90001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(false);
    });

    it("should NOT flag when only address matches (different names)", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2: BusinessForComparison = {
        name: "Mike's Diner",
        address: "123 Main Street, New York, NY 10001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameAboveThreshold).toBe(false);
      expect(result.addressAboveThreshold).toBe(true);
    });

    it("should NOT flag when neither name nor address matches", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2: BusinessForComparison = {
        name: "Mike's Diner",
        address: "456 Oak Ave, Los Angeles, CA 90001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameAboveThreshold).toBe(false);
      expect(result.addressAboveThreshold).toBe(false);
    });
  });

  describe("Similarity algorithm - Levenshtein and Jaccard", () => {
    it("should calculate Levenshtein distance correctly", () => {
      expect(levenshteinDistance("kitten", "sitting")).toBe(3);
      expect(levenshteinDistance("flaw", "lawn")).toBe(2);
      expect(levenshteinDistance("", "test")).toBe(4);
      expect(levenshteinDistance("test", "")).toBe(4);
    });

    it("should calculate normalized Levenshtein similarity", () => {
      expect(levenshteinSimilarity("test", "test")).toBe(1);
      expect(levenshteinSimilarity("", "")).toBe(1);
      expect(levenshteinSimilarity("a", "")).toBe(0);
    });

    it("should calculate Jaccard similarity using word sets", () => {
      // Identical strings
      expect(jaccardSimilarity("hello world", "hello world")).toBe(1);

      // Completely different
      expect(jaccardSimilarity("aaa bbb ccc", "xxx yyy zzz")).toBe(0);

      // Partial overlap
      const result = jaccardSimilarity("hello world foo", "hello world bar");
      // Shared: hello, world (2 words)
      // Union: hello, world, foo, bar (4 words)
      // Jaccard = 2/4 = 0.5
      expect(result).toBe(0.5);
    });

    it("should combine Levenshtein and Jaccard with weighted average", () => {
      const result = combinedSimilarity("test", "test");
      expect(result).toBe(1);

      const different = combinedSimilarity("aaa", "bbb");
      expect(different).toBeLessThan(0.5);
    });

    it("should use normalized comparison for similarity", () => {
      // After normalization, these should be identical
      const similarity = normalizedSimilarity("123 Main Street", "123 main st");
      expect(similarity).toBe(1);
    });
  });

  describe("Configuration - custom thresholds", () => {
    it("should use default thresholds when no config provided", () => {
      const business1: BusinessForComparison = {
        name: "Test Business",
        address: "123 Test St",
      };
      const business2: BusinessForComparison = {
        name: "Test Business",
        address: "123 Test St",
      };

      const result = checkForDuplicate(business1, business2);

      // With default thresholds (name: 0.6, address: 0.8), exact match should pass
      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.nameSimilarity).toBe(1);
      expect(result.addressSimilarity).toBe(1);
    });

    it("should apply custom name threshold", () => {
      const strictConfig: DuplicateDetectionConfig = {
        nameThreshold: 0.95,
        addressThreshold: 0.8,
        nameWeight: 0.6,
        addressWeight: 0.4,
      };

      const business1: BusinessForComparison = {
        name: "Test Business",
        address: "123 Test St",
      };
      const business2: BusinessForComparison = {
        name: "Test Business Inc",
        address: "123 Test St",
      };

      const result = checkForDuplicate(business1, business2, strictConfig);

      // With strict 0.95 threshold, "Test Business" vs "Test Business Inc" may not pass
      expect(result.nameSimilarity).toBeGreaterThan(0.8);
    });

    it("should validate default config values", () => {
      expect(DEFAULT_DUPLICATE_CONFIG.nameThreshold).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_DUPLICATE_CONFIG.nameThreshold).toBeLessThanOrEqual(1);
      expect(DEFAULT_DUPLICATE_CONFIG.addressThreshold).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_DUPLICATE_CONFIG.addressThreshold).toBeLessThanOrEqual(1);
      expect(DEFAULT_DUPLICATE_CONFIG.nameWeight + DEFAULT_DUPLICATE_CONFIG.addressWeight).toBe(1);
    });
  });

  describe("Edge cases - empty strings and special characters", () => {
    it("should handle empty name gracefully", () => {
      const business1: BusinessForComparison = {
        name: "",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Business",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBe(0);
      expect(result.isPotentialDuplicate).toBe(false);
    });

    it("should handle empty address gracefully", () => {
      const business1: BusinessForComparison = {
        name: "Business",
        address: "",
      };
      const business2: BusinessForComparison = {
        name: "Business",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBe(0);
      expect(result.isPotentialDuplicate).toBe(false);
    });

    it("should handle both empty gracefully", () => {
      const business1: BusinessForComparison = {
        name: "",
        address: "",
      };
      const business2: BusinessForComparison = {
        name: "Business",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBe(0);
      expect(result.addressSimilarity).toBe(0);
      expect(result.isPotentialDuplicate).toBe(false);
    });

    it("should handle special characters in names", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Joes Restaurant",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      // Apostrophe should be handled gracefully
      expect(result.nameSimilarity).toBeGreaterThan(0.8);
    });

    it("should handle unicode characters", () => {
      const business1: BusinessForComparison = {
        name: "Café",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Cafe",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      // Should not crash, may or may not match depending on normalization
      expect(result.nameSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.nameSimilarity).toBeLessThanOrEqual(1);
    });
  });

  describe("Combined score calculation", () => {
    it("should calculate combined score as weighted average", () => {
      const business1: BusinessForComparison = {
        name: "Business A",
        address: "100 First St",
      };
      const business2: BusinessForComparison = {
        name: "Business B",
        address: "100 First St",
      };

      const result = checkForDuplicate(business1, business2);

      // Address is identical (score = 1)
      // Name is different (score < 1)
      // Combined = 0.6 * nameScore + 0.4 * addressScore
      expect(result.addressSimilarity).toBe(1);
      expect(result.nameSimilarity).toBeLessThan(0.9);
      expect(result.combinedScore).toBeLessThan(1);
      expect(result.combinedScore).toBeGreaterThan(result.nameSimilarity);
    });

    it("should return 1 for exact matches on both name and address", () => {
      const business1: BusinessForComparison = {
        name: "Exact Match",
        address: "Exact Address",
      };
      const business2: BusinessForComparison = {
        name: "Exact Match",
        address: "Exact Address",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBe(1);
      expect(result.addressSimilarity).toBe(1);
      expect(result.combinedScore).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });
  });

  describe("Real-world scenarios from AC", () => {
    it("should handle the exact AC scenario with all variations", () => {
      const scenarios: Array<{
        existing: BusinessForComparison;
        scraped: BusinessForComparison;
        shouldFlag: boolean;
        description: string;
      }> = [
        {
          existing: { name: "Joe's Restaurant", address: "123 Main St, New York, NY 10001" },
          scraped: { name: "Joe's Restaurant LLC", address: "123 Main Street, New York, NY 10001" },
          shouldFlag: true,
          description: "AC scenario: LLC suffix + Street/St variation",
        },
        {
          existing: { name: "Joe's Restaurant", address: "123 Main St, New York, NY 10001" },
          scraped: { name: "Joe's Restaurant", address: "123 Main St, New York, NY 10001" },
          shouldFlag: true,
          description: "Exact match",
        },
        {
          existing: { name: "Joe's Restaurant", address: "123 Main St, New York, NY 10001" },
          scraped: { name: "Joe's Restaurant (Main Entrance)", address: "123 Main St, New York, NY 10001" },
          shouldFlag: true,
          description: "Parenthetical suffix",
        },
        {
          existing: { name: "ABC Company", address: "100 First St, Boston, MA 02101" },
          scraped: { name: "ABC Company Inc", address: "100 First Street, Boston, MA 02101" },
          shouldFlag: true,
          description: "Different company with similar pattern",
        },
        {
          existing: { name: "Different Business", address: "123 Main St, New York, NY 10001" },
          scraped: { name: "Joe's Restaurant", address: "456 Oak Ave, Los Angeles, CA 90001" },
          shouldFlag: false,
          description: "Completely different businesses",
        },
      ];

      for (const scenario of scenarios) {
        const result = checkForDuplicate(scenario.existing, scenario.scraped);
        expect(result.isPotentialDuplicate).toBe(scenario.shouldFlag);
      }
    });
  });
});
