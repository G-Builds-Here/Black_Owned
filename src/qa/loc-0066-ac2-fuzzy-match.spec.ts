/**
 * QA Tests - LOC-0066-AC2: Detect name + address fuzzy match
 *
 * End-to-end verification of fuzzy duplicate detection for businesses.
 * Tests the exact scenario from the acceptance criteria.
 */

import {
  checkForDuplicate,
  type BusinessForComparison,
} from "../services/duplicate-detection-service";

describe("QA: LOC-0066-AC2 - Fuzzy Name + Address Match", () => {
  describe("AC Scenario: Joe's Restaurant duplicate detection", () => {
    it("should detect 'Joe's Restaurant' and 'Joe's Restaurant LLC' as potential duplicates at same address", () => {
      // Given a business with name "Joe's Restaurant" at "123 Main St" exists
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };

      // When a new business with name "Joe's Restaurant LLC" at "123 Main Street" is imported
      const newBusiness: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "123 Main Street",
      };

      const result = checkForDuplicate(existingBusiness, newBusiness);

      // Then the new business is marked as potential duplicate
      expect(result.isPotentialDuplicate).toBe(true);

      // And a similarity score is calculated
      expect(result.nameSimilarity).toBeGreaterThan(0);
      expect(result.addressSimilarity).toBeGreaterThan(0);
      expect(result.combinedScore).toBeGreaterThan(0);
    });

    it("should calculate meaningful similarity scores for name variations", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "123 Main Street",
      };

      const result = checkForDuplicate(business1, business2);

      // Name similarity should be high (only "LLC" difference)
      expect(result.nameSimilarity).toBeGreaterThanOrEqual(0.8);

      // Address similarity should be very high (only "St" vs "Street")
      expect(result.addressSimilarity).toBeGreaterThanOrEqual(0.9);
    });

    it("should not flag businesses with same name but different addresses", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "456 Oak Ave",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.addressAboveThreshold).toBe(false);
    });

    it("should not flag businesses with same address but different names", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Mike's Diner",
        address: "123 Main Street",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameAboveThreshold).toBe(false);
    });
  });

  describe("Address normalization edge cases", () => {
    it("should handle 'St' vs 'Street' variations", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "100 First St",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "100 First Street",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle 'Ave' vs 'Avenue' variations", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "200 Second Ave",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "200 Second Avenue",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle 'Blvd' vs 'Boulevard' variations", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "300 Third Blvd",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "300 Third Boulevard",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle 'Rd' vs 'Road' variations", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "400 Fourth Rd",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "400 Fourth Road",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle 'Dr' vs 'Drive' variations", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "500 Fifth Dr",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "500 Fifth Drive",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.addressSimilarity).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });
  });

  describe("Business suffix handling", () => {
    it("should handle LLC suffix variation", () => {
      const business1: BusinessForComparison = {
        name: "Tech Solutions",
        address: "100 Tech Blvd",
      };
      const business2: BusinessForComparison = {
        name: "Tech Solutions LLC",
        address: "100 Tech Boulevard",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle Inc suffix variation", () => {
      const business1: BusinessForComparison = {
        name: "Food Corp",
        address: "200 Food St",
      };
      const business2: BusinessForComparison = {
        name: "Food Corporation",
        address: "200 Food Street",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle Ltd suffix variation", () => {
      const business1: BusinessForComparison = {
        name: "Retail Group",
        address: "300 Retail Ave",
      };
      const business2: BusinessForComparison = {
        name: "Retail Group Limited",
        address: "300 Retail Avenue",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
    });
  });

  describe("Case insensitivity", () => {
    it("should handle uppercase vs lowercase names", () => {
      const business1: BusinessForComparison = {
        name: "JOE'S RESTAURANT",
        address: "123 MAIN ST",
      };
      const business2: BusinessForComparison = {
        name: "joe's restaurant",
        address: "123 main st",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.nameSimilarity).toBe(1);
      expect(result.addressSimilarity).toBe(1);
    });

    it("should handle mixed case variations", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "JOE'S RESTAURANT LLC",
        address: "123 MAIN STREET",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
    });
  });

  describe("Similarity score ranges", () => {
    it("should return similarity scores in 0-1 range", () => {
      const business1: BusinessForComparison = {
        name: "Business A",
        address: "100 First St",
      };
      const business2: BusinessForComparison = {
        name: "Business B",
        address: "200 Second St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.nameSimilarity).toBeLessThanOrEqual(1);
      expect(result.addressSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.addressSimilarity).toBeLessThanOrEqual(1);
      expect(result.combinedScore).toBeGreaterThanOrEqual(0);
      expect(result.combinedScore).toBeLessThanOrEqual(1);
    });

    it("should return 1.0 for exact matches", () => {
      const business1: BusinessForComparison = {
        name: "Exact Match",
        address: "100 Exact St",
      };
      const business2: BusinessForComparison = {
        name: "Exact Match",
        address: "100 Exact St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameSimilarity).toBe(1);
      expect(result.addressSimilarity).toBe(1);
      expect(result.combinedScore).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });
  });

  describe("Threshold behavior", () => {
    it("should require BOTH name and address to exceed thresholds", () => {
      // Same name, completely different address
      const business1: BusinessForComparison = {
        name: "Same Name",
        address: "100 First St",
      };
      const business2: BusinessForComparison = {
        name: "Same Name",
        address: "999 Different Ave, Different City, Different State",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(false);
      expect(result.isPotentialDuplicate).toBe(false);
    });

    it("should handle custom strict thresholds", () => {
      const business1: BusinessForComparison = {
        name: "Test Business",
        address: "123 Test St",
      };
      const business2: BusinessForComparison = {
        name: "Test Business Inc",
        address: "123 Test Street",
      };

      const strictConfig = {
        nameThreshold: 0.95,
        addressThreshold: 0.95,
        nameWeight: 0.5,
        addressWeight: 0.5,
      };

      const result = checkForDuplicate(business1, business2, strictConfig);

      // With strict thresholds, scores should still be calculated
      expect(result.nameSimilarity).toBeGreaterThan(0.8);
      expect(result.addressSimilarity).toBeGreaterThan(0.8);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty strings gracefully", () => {
      const business1: BusinessForComparison = {
        name: "",
        address: "",
      };
      const business2: BusinessForComparison = {
        name: "Business",
        address: "123 St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.nameSimilarity).toBe(0);
      expect(result.addressSimilarity).toBe(0);
    });

    it("should handle whitespace-only strings", () => {
      const business1: BusinessForComparison = {
        name: "   ",
        address: "   ",
      };
      const business2: BusinessForComparison = {
        name: "Business",
        address: "123 St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(false);
    });

    it("should handle apostrophes in names", () => {
      const business1: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Joes Restaurant",
        address: "123 Main St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should handle extra whitespace in addresses", () => {
      const business1: BusinessForComparison = {
        name: "Same Business",
        address: "123 Main St",
      };
      const business2: BusinessForComparison = {
        name: "Same Business",
        address: "123   Main    St",
      };

      const result = checkForDuplicate(business1, business2);

      expect(result.isPotentialDuplicate).toBe(true);
    });
  });
});
