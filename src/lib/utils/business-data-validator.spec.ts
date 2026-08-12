/**
 * Business Data Validator Tests
 */

import {
  validateBusinessData,
  validateBusinessDataBatch,
  isBusinessDataValid,
  BusinessValidationInput,
} from "./business-data-validator";
import { ScraperSource } from "../../types/scraper-result";

describe("Business Data Validator", () => {
  const createValidInput = (): BusinessValidationInput => ({
    name: "Test Business",
    categoryId: "restaurant",
    source: ScraperSource.GOOGLE_MAPS,
    phone: "555-123-4567",
    email: "test@example.com",
    website: "https://example.com",
    address: "123 Main St",
    rating: 4.5,
    reviewCount: 150,
  });

  describe("validateBusinessData", () => {
    describe("required fields", () => {
      it("should pass validation for complete valid input", () => {
        const input = createValidInput();
        const result = validateBusinessData(input);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized?.name).toBe("Test Business");
        expect(result.sanitized?.categoryId).toBe("food-dining");
      });

      it("should fail when name is missing", () => {
        const input: BusinessValidationInput = {
          ...createValidInput(),
          name: "",
        };
        const result = validateBusinessData(input);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "name")).toBe(true);
      });

      it("should fail when name is too short", () => {
        const input: BusinessValidationInput = {
          ...createValidInput(),
          name: "A",
        };
        const result = validateBusinessData(input);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "name")).toBe(true);
      });

      it("should fail when categoryId is missing", () => {
        const input: BusinessValidationInput = {
          ...createValidInput(),
          categoryId: "",
        };
        const result = validateBusinessData(input);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "categoryId")).toBe(true);
      });
    });

    describe("category validation", () => {
      it("should map known categories correctly", () => {
        const testCases = [
          { input: "restaurant", expected: "food-dining" },
          { input: "lawyer", expected: "professional-services" },
          { input: "doctor", expected: "health-wellness" },
          { input: "plumber", expected: "home-services" },
          { input: "bank", expected: "financial-services" },
        ];

        for (const { input, expected } of testCases) {
          const result = validateBusinessData({
            name: "Test",
            categoryId: input,
            source: ScraperSource.GOOGLE_MAPS,
          });

          expect(result.sanitized?.categoryId).toBe(expected);
        }
      });

      it("should use 'other' for unknown categories with a warning", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "unknown-category",
          source: ScraperSource.GOOGLE_MAPS,
        });

        expect(result.sanitized?.categoryId).toBe("other");
        expect(result.warnings.some((w) => w.includes("unknown-category"))).toBe(true);
      });

      it("should normalize category input", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "RESTAURANT",
          source: ScraperSource.GOOGLE_MAPS,
        });

        expect(result.sanitized?.categoryId).toBe("food-dining");
      });
    });

    describe("rating validation", () => {
      it("should accept valid ratings", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          rating: 4.5,
        });

        expect(result.isValid).toBe(true);
        expect(result.sanitized?.rating).toBe(4.5);
      });

      it("should accept string ratings", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          rating: "4.5",
        });

        expect(result.isValid).toBe(true);
        expect(result.sanitized?.rating).toBe(4.5);
      });

      it("should reject ratings outside 1-5 range", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          rating: 6,
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "rating")).toBe(true);
      });

      it("should reject invalid rating format", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          rating: "invalid",
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "rating")).toBe(true);
      });

      it("should accept undefined rating", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
        });

        expect(result.isValid).toBe(true);
        expect(result.sanitized?.rating).toBeUndefined();
      });
    });

    describe("review count validation", () => {
      it("should accept valid review counts", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          reviewCount: 150,
        });

        expect(result.isValid).toBe(true);
        expect(result.sanitized?.reviewCount).toBe(150);
      });

      it("should accept string review counts", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          reviewCount: "150",
        });

        expect(result.isValid).toBe(true);
        expect(result.sanitized?.reviewCount).toBe(150);
      });

      it("should handle formatted review counts", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          reviewCount: "1.2K",
        });

        expect(result.isValid).toBe(true);
        expect(result.sanitized?.reviewCount).toBe(1200);
      });

      it("should reject negative review counts", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          reviewCount: -5,
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "reviewCount")).toBe(true);
      });
    });

    describe("contact validation", () => {
      it("should validate phone number format", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          phone: "555-123-4567",
        });

        expect(result.isValid).toBe(true);
      });

      it("should reject invalid phone format", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          phone: "abc-def-ghij",
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "phone")).toBe(true);
      });

      it("should validate email format", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          email: "test@example.com",
        });

        expect(result.isValid).toBe(true);
      });

      it("should reject invalid email format", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          email: "invalid-email",
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "email")).toBe(true);
      });

      it("should validate website URL format", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          website: "https://example.com",
        });

        expect(result.isValid).toBe(true);
      });

      it("should reject invalid website URL format", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          website: "not-a-url",
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === "website")).toBe(true);
      });

      it("should accept missing optional contact fields", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
        });

        expect(result.isValid).toBe(true);
      });
    });

    describe("sanitization", () => {
      it("should sanitize phone number to digits only", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          phone: "(555) 123-4567",
        });

        expect(result.sanitized?.phone).toBe("5551234567");
      });

      it("should sanitize email to lowercase", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          email: "TEST@EXAMPLE.COM",
        });

        expect(result.sanitized?.email).toBe("test@example.com");
      });

      it("should add https to website URLs without protocol", () => {
        const result = validateBusinessData({
          name: "Test",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          website: "example.com",
        });

        expect(result.sanitized?.website).toBe("https://example.com");
      });

      it("should trim whitespace from name and address", () => {
        const result = validateBusinessData({
          name: "  Test Business  ",
          categoryId: "restaurant",
          source: ScraperSource.GOOGLE_MAPS,
          address: "  123 Main St  ",
        });

        expect(result.sanitized?.name).toBe("Test Business");
        expect(result.sanitized?.address).toBe("123 Main St");
      });
    });
  });

  describe("validateBusinessDataBatch", () => {
    it("should validate multiple business inputs", () => {
      const inputs: BusinessValidationInput[] = [
        { name: "Valid Business", categoryId: "restaurant", source: ScraperSource.GOOGLE_MAPS },
        { name: "", categoryId: "restaurant", source: ScraperSource.GOOGLE_MAPS },
        { name: "Another Valid", categoryId: "doctor", source: ScraperSource.YELP },
      ];

      const results = validateBusinessDataBatch(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
      expect(results[2].isValid).toBe(true);
    });
  });

  describe("isBusinessDataValid", () => {
    it("should return true for valid data", () => {
      const input: BusinessValidationInput = {
        name: "Test",
        categoryId: "restaurant",
        source: ScraperSource.GOOGLE_MAPS,
      };

      expect(isBusinessDataValid(input)).toBe(true);
    });

    it("should return false for invalid data", () => {
      const input: BusinessValidationInput = {
        name: "",
        categoryId: "restaurant",
        source: ScraperSource.GOOGLE_MAPS,
      };

      expect(isBusinessDataValid(input)).toBe(false);
    });
  });
});
