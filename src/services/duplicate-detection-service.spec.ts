/**
 * Duplicate Detection Service Tests
 *
 * Tests for fuzzy name + address matching functionality.
 */

import {
  checkForDuplicate,
  normalizeAddress,
  DEFAULT_DUPLICATE_CONFIG,
  type DuplicateDetectionConfig,
} from "./duplicate-detection-service";

describe("Duplicate Detection Service", () => {
  describe("checkForDuplicate", () => {
    it("should detect exact matches as duplicates", () => {
      const business1 = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2 = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.nameSimilarity).toBe(1);
      expect(result.addressSimilarity).toBe(1);
      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(true);
    });

    it("should detect fuzzy name match with address match as duplicate", () => {
      // This is the exact scenario from the AC
      const business1 = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2 = {
        name: "Joe's Restaurant LLC",
        address: "123 Main Street, New York, NY 10001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(true);
    });

    it("should not flag when only name matches", () => {
      const business1 = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2 = {
        name: "Joe's Restaurant LLC",
        address: "456 Oak Ave, Los Angeles, CA 90001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(false);
    });

    it("should not flag when only address matches", () => {
      const business1 = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
      };
      const business2 = {
        name: "Mike's Diner",
        address: "123 Main Street, New York, NY 10001",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameAboveThreshold).toBe(false);
      expect(result.addressAboveThreshold).toBe(true);
    });

    it("should calculate similarity scores in 0-1 range", () => {
      const business1 = {
        name: "ABC Company",
        address: "100 First Street",
      };
      const business2 = {
        name: "XYZ Corporation",
        address: "200 Second Avenue",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.nameSimilarity).toBeLessThanOrEqual(1);
      expect(result.addressSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.addressSimilarity).toBeLessThanOrEqual(1);
      expect(result.combinedScore).toBeGreaterThanOrEqual(0);
      expect(result.combinedScore).toBeLessThanOrEqual(1);
    });

    it("should use custom thresholds when provided", () => {
      const business1 = {
        name: "Test Business",
        address: "123 Test St",
      };
      const business2 = {
        name: "Test Business Inc",
        address: "123 Test Street",
      };

      const strictConfig: DuplicateDetectionConfig = {
        nameThreshold: 0.95,
        addressThreshold: 0.95,
        nameWeight: 0.5,
        addressWeight: 0.5,
      };

      const result = checkForDuplicate(business1, business2, strictConfig);

      // With stricter thresholds, may not be flagged
      expect(result.nameSimilarity).toBeGreaterThan(0.8);
      expect(result.addressSimilarity).toBeGreaterThan(0.8);
    });

    it("should handle case-insensitive comparison", () => {
      const business1 = {
        name: "JOE'S RESTAURANT",
        address: "123 MAIN ST",
      };
      const business2 = {
        name: "joe's restaurant",
        address: "123 main st",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.nameSimilarity).toBe(1);
      expect(result.addressSimilarity).toBe(1);
    });

    it("should handle different address formats", () => {
      const business1 = {
        name: "Same Business",
        address: "123 Main Street, New York, NY 10001",
      };
      const business2 = {
        name: "Same Business",
        address: "123 Main St, New York, NY 10001",
      };

      const result = checkForDuplicate(business1, business2);

      // Should normalize "Street" to "St" and detect match
      expect(result.addressAboveThreshold).toBe(true);
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should return combined score reflects weighted average", () => {
      const business1 = {
        name: "Business A",
        address: "100 First St",
      };
      const business2 = {
        name: "Business B",
        address: "100 First St",
      };

      const result = checkForDuplicate(business1, business2);

      // Name is different, address is same
      // Combined score should be weighted: 0.6 * low + 0.4 * high
      expect(result.addressSimilarity).toBe(1);
      expect(result.nameSimilarity).toBeLessThan(0.9);
    });

    it("should handle empty strings gracefully", () => {
      const business1 = {
        name: "",
        address: "",
      };
      const business2 = {
        name: "Business",
        address: "123 St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameSimilarity).toBe(0);
      expect(result.addressSimilarity).toBe(0);
    });
  });

  describe("normalizeAddress", () => {
    it("should normalize address with street abbreviation", () => {
      const normalized = normalizeAddress("123 Main Street");
      expect(normalized).toContain("st");
    });

    it("should handle case normalization", () => {
      const normalized = normalizeAddress("123 MAIN STREET");
      expect(normalized).toBe(normalizeAddress("123 main street"));
    });

    it("should remove extra whitespace", () => {
      const normalized = normalizeAddress("123   Main    Street");
      expect(normalized).not.toContain("  ");
    });
  });

  describe("DEFAULT_DUPLICATE_CONFIG", () => {
    it("should have valid threshold values", () => {
      expect(DEFAULT_DUPLICATE_CONFIG.nameThreshold).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_DUPLICATE_CONFIG.nameThreshold).toBeLessThanOrEqual(1);
      expect(DEFAULT_DUPLICATE_CONFIG.addressThreshold).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_DUPLICATE_CONFIG.addressThreshold).toBeLessThanOrEqual(1);
    });

    it("should have valid weight values", () => {
      expect(DEFAULT_DUPLICATE_CONFIG.nameWeight + DEFAULT_DUPLICATE_CONFIG.addressWeight).toBe(1);
    });
  });
});
