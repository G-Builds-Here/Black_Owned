/**
 * QA Tests for LOC-0075-AC1 - Phone Number Duplicate Detection
 *
 * Acceptance Criteria:
 * Given a business with phone "+1-555-123-4567" exists in directory
 * When a new business with the same phone is scraped
 * Then the new business is marked as potential duplicate
 * And the existing business ID is returned
 *
 * Copyright 2026 Black Owned Directory
 */

import {
  checkForDuplicate,
  normalizePhoneNumber,
  DEFAULT_DUPLICATE_CONFIG,
  type BusinessForComparison,
  type DuplicateCheckResult,
} from "../services/duplicate-detection-service";

describe("LOC-0075-AC1: Phone Number Duplicate Detection", () => {
  describe("normalizePhoneNumber", () => {
    it("should normalize phone with country code and dashes", () => {
      expect(normalizePhoneNumber("+1-555-123-4567")).toBe("15551234567");
    });

    it("should normalize phone with parentheses and spaces", () => {
      expect(normalizePhoneNumber("(555) 123-4567")).toBe("5551234567");
    });

    it("should normalize phone with only dashes", () => {
      expect(normalizePhoneNumber("555-123-4567")).toBe("5551234567");
    });

    it("should normalize phone with only spaces", () => {
      expect(normalizePhoneNumber("555 123 4567")).toBe("5551234567");
    });

    it("should handle already normalized phone (digits only)", () => {
      expect(normalizePhoneNumber("5551234567")).toBe("5551234567");
    });

    it("should handle phone with mixed formatting", () => {
      expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("15551234567");
    });

    it("should handle empty string", () => {
      expect(normalizePhoneNumber("")).toBe("");
    });

    it("should handle undefined", () => {
      expect(normalizePhoneNumber(undefined)).toBe("");
    });

    it("should handle null", () => {
      expect(normalizePhoneNumber(null)).toBe("");
    });

    it("should handle phone with leading zeros", () => {
      expect(normalizePhoneNumber("01234567890")).toBe("01234567890");
    });

    it("should handle international phone numbers", () => {
      expect(normalizePhoneNumber("+44 20 7946 0958")).toBe("442079460958");
      expect(normalizePhoneNumber("+33 1 23 45 67 89")).toBe("33123456789");
    });
  });

  describe("AC Scenario: Exact phone match detection", () => {
    it("should detect duplicate when same phone number with different formatting", () => {
      // First business exists with formatted phone
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
        phone: "+1-555-123-4567",
      };

      // New business scraped with different formatting but same number (including country code)
      const scrapedBusiness: BusinessForComparison = {
        name: "Joe's Diner",
        address: "456 Oak Ave, Los Angeles, CA 90001",
        phone: "1-555-123-4567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      // Should be flagged as duplicate due to phone match
      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.phoneMatch).toBe(true);
      expect(result.phoneSimilarity).toBe(1);
    });

    it("should detect duplicate with exact same phone string", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Business A",
        address: "123 Main St",
        phone: "555-123-4567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Business B",
        address: "456 Oak Ave",
        phone: "555-123-4567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.phoneMatch).toBe(true);
    });

    it("should detect duplicate with normalized phone numbers", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Business A",
        address: "123 Main St",
        phone: "5551234567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Business B",
        address: "456 Oak Ave",
        phone: "5551234567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.phoneMatch).toBe(true);
    });

    it("should detect duplicate with international phone numbers", () => {
      const existingBusiness: BusinessForComparison = {
        name: "UK Business",
        address: "123 London Rd",
        phone: "+44 20 7946 0958",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "UK Business Ltd",
        address: "456 Manchester Ave",
        phone: "442079460958",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.phoneMatch).toBe(true);
    });
  });

  describe("Phone match takes precedence over name/address", () => {
    it("should flag as duplicate even when name and address are completely different", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
        phone: "+1-555-123-4567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Completely Different Business Name",
        address: "999 Totally Different Street, Chicago, IL 60601",
        phone: "1-555-123-4567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      // Phone match should trigger duplicate detection
      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.phoneMatch).toBe(true);
      // Name and address should NOT match
      expect(result.nameAboveThreshold).toBe(false);
      expect(result.addressAboveThreshold).toBe(false);
    });

    it("should NOT flag as duplicate when phone numbers are different", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
        phone: "+1-555-123-4567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Mike's Diner",
        address: "456 Oak Ave",
        phone: "+1-555-987-6543",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.phoneMatch).toBe(false);
    });

    it("should NOT flag as duplicate when only one business has phone", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
        phone: "+1-555-123-4567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
        // No phone provided
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      // No phone match because one is missing
      expect(result.phoneMatch).toBe(false);
      // But name and address match, so still a duplicate
      expect(result.isPotentialDuplicate).toBe(true);
    });

    it("should NOT flag as duplicate when both businesses have no phone", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Mike's Diner",
        address: "456 Oak Ave",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.phoneMatch).toBe(false);
      expect(result.isPotentialDuplicate).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty phone strings gracefully", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Business A",
        address: "123 Main St",
        phone: "",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Business B",
        address: "456 Oak Ave",
        phone: "5551234567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.phoneMatch).toBe(false);
    });

    it("should handle phone with extra characters", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Business A",
        address: "123 Main St",
        phone: "Phone: 555-123-4567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Business B",
        address: "456 Oak Ave",
        phone: "5551234567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.phoneMatch).toBe(true);
    });

    it("should handle phone with extension - extension digits included in match", () => {
      // Extension digits are included in normalization
      const existingBusiness: BusinessForComparison = {
        name: "Business A",
        address: "123 Main St",
        phone: "555-123-4567123",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Business B",
        address: "456 Oak Ave",
        phone: "5551234567123",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      // Numbers should match when both include extension digits
      expect(result.phoneSimilarity).toBe(1);
    });

    it("should handle very short phone numbers", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Business A",
        address: "123 Main St",
        phone: "1234567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Business B",
        address: "456 Oak Ave",
        phone: "1234567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.phoneMatch).toBe(true);
    });
  });

  describe("Combined duplicate detection - phone + name/address", () => {
    it("should flag as duplicate when phone matches AND name/address also match", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Joe's Restaurant",
        address: "123 Main St, New York, NY 10001",
        phone: "+1-555-123-4567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Joe's Restaurant LLC",
        address: "123 Main Street, New York, NY 10001",
        phone: "1-555-123-4567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.phoneMatch).toBe(true);
      expect(result.nameAboveThreshold).toBe(true);
      expect(result.addressAboveThreshold).toBe(true);
    });

    it("should return high combined score when all fields match", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Exact Match Business",
        address: "Exact Same Address",
        phone: "5551234567",
      };

      const scrapedBusiness: BusinessForComparison = {
        name: "Exact Match Business",
        address: "Exact Same Address",
        phone: "5551234567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.nameSimilarity).toBe(1);
      expect(result.addressSimilarity).toBe(1);
      expect(result.phoneSimilarity).toBe(1);
      expect(result.combinedScore).toBe(1);
      expect(result.isPotentialDuplicate).toBe(true);
    });
  });

  describe("AC verification - exact scenario from ticket", () => {
    it("should detect duplicate for the exact AC scenario: +1-555-123-4567", () => {
      // Given a business with "+1-555-123-4567" exists in directory
      const existingBusiness: BusinessForComparison = {
        id: "existing-business-id",
        name: "Existing Business",
        address: "100 Existing St",
        phone: "+1-555-123-4567",
      };

      // When a new business with the same phone is scraped
      const scrapedBusiness: BusinessForComparison = {
        name: "New Scraped Business",
        address: "200 New Ave",
        phone: "+1-555-123-4567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      // Then the new business is marked as potential duplicate
      expect(result.isPotentialDuplicate).toBe(true);

      // And phone match is confirmed
      expect(result.phoneMatch).toBe(true);
      expect(result.phoneSimilarity).toBe(1);
    });

    it("should handle the AC scenario with different phone formats", () => {
      const existingBusiness: BusinessForComparison = {
        name: "Existing Business",
        address: "100 Existing St",
        phone: "+1-555-123-4567",
      };

      // Same number, different format
      const scrapedBusiness: BusinessForComparison = {
        name: "New Business",
        address: "200 New Ave",
        phone: "15551234567",
      };

      const result = checkForDuplicate(existingBusiness, scrapedBusiness);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.phoneMatch).toBe(true);
    });
  });
});
