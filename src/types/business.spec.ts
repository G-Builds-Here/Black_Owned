/**
 * Business Types Tests
 *
 * Tests for business profile types and validation functions.
 */

import {
  validateBusinessProfile,
  isValidTimeFormat,
  getDefaultBusinessHours,
  type BusinessProfile,
  type BusinessHours,
  type VerificationStatus,
  type BusinessCategory,
  type Business,
} from "./business";

describe("Business Types", () => {
  describe("isValidTimeFormat", () => {
    it("should accept valid time formats", () => {
      expect(isValidTimeFormat("09:00")).toBe(true);
      expect(isValidTimeFormat("17:30")).toBe(true);
      expect(isValidTimeFormat("23:59")).toBe(true);
      expect(isValidTimeFormat("00:00")).toBe(true);
      expect(isValidTimeFormat("9:00")).toBe(true);
      expect(isValidTimeFormat("1:30")).toBe(true);
    });

    it("should reject invalid time formats", () => {
      expect(isValidTimeFormat("25:00")).toBe(false);
      expect(isValidTimeFormat("12:60")).toBe(false);
      expect(isValidTimeFormat("9:0")).toBe(false);
      expect(isValidTimeFormat("900")).toBe(false);
      expect(isValidTimeFormat("9-00")).toBe(false);
      expect(isValidTimeFormat("")).toBe(false);
    });
  });

  describe("getDefaultBusinessHours", () => {
    it("should return hours object with all days closed", () => {
      const hours = getDefaultBusinessHours();
      expect(hours).toEqual({
        monday: {},
        tuesday: {},
        wednesday: {},
        thursday: {},
        friday: {},
        saturday: {},
        sunday: {},
      });
    });
  });

  describe("validateBusinessProfile", () => {
    const createValidProfile = (overrides?: Partial<BusinessProfile>): BusinessProfile => ({
      name: "Test Business",
      description: "A test business description",
      hours: {
        monday: { open: "09:00", close: "17:00" },
        tuesday: { open: "09:00", close: "17:00" },
        wednesday: { open: "09:00", close: "17:00" },
        thursday: { open: "09:00", close: "17:00" },
        friday: { open: "09:00", close: "17:00" },
        saturday: { open: "10:00", close: "14:00" },
        sunday: {},
      },
      categories: ["food-dining", "retail-fashion"],
      verificationStatus: "verified",
      ...overrides,
    });

    it("should validate a complete business profile", () => {
      const profile = createValidProfile();
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should reject profile with missing name", () => {
      const profile = createValidProfile({ name: "" });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: name");
    });

    it("should reject profile with invalid verification status", () => {
      const profile = createValidProfile({ verificationStatus: "invalid" as VerificationStatus });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid verificationStatus: invalid (must be one of: unverified, pending, verified)");
    });

    it("should accept all valid verification statuses", () => {
      const statuses: VerificationStatus[] = ["unverified", "pending", "verified"];
      for (const status of statuses) {
        const profile = createValidProfile({ verificationStatus: status });
        const result = validateBusinessProfile(profile);
        expect(result.valid).toBe(true);
      }
    });

    it("should reject profile with invalid time format in hours", () => {
      const profile = createValidProfile({
        hours: {
          monday: { open: "25:00", close: "17:00" },
          tuesday: {},
          wednesday: {},
          thursday: {},
          friday: {},
          saturday: {},
          sunday: {},
        } as BusinessHours,
      });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid open time for monday: 25:00 (must be HH:MM format)");
    });

    it("should reject profile with invalid category", () => {
      const profile = createValidProfile({ categories: ["invalid-category" as BusinessCategory] });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid category: invalid-category");
    });

    it("should accept all valid categories", () => {
      const validCategories: BusinessCategory[] = [
        "food-dining",
        "professional-services",
        "retail-fashion",
        "health-wellness",
        "automotive",
        "home-services",
        "entertainment",
        "education",
        "financial-services",
        "other",
      ];
      for (const category of validCategories) {
        const profile = createValidProfile({ categories: [category] });
        const result = validateBusinessProfile(profile);
        expect(result.valid).toBe(true);
      }
    });

    it("should allow optional description", () => {
      const profile = createValidProfile({ description: undefined });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(true);
    });

    it("should allow optional imageUrl", () => {
      const profile = createValidProfile({ imageUrl: undefined });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(true);
    });

    it("should allow empty hours for all days", () => {
      const profile = createValidProfile({
        hours: getDefaultBusinessHours(),
      });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(true);
    });

    it("should report multiple validation errors", () => {
      const profile = createValidProfile({
        name: "",
        verificationStatus: "invalid" as VerificationStatus,
        categories: ["invalid" as BusinessCategory],
      });
      const result = validateBusinessProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe("Business entity", () => {
    it("should include rating and reviewCount fields", () => {
      const business: Business = {
        id: "test-id",
        ownerId: "owner-id",
        name: "Test Business",
        description: "Test description",
        categoryId: "cat-1",
        rating: 4.5,
        reviewCount: 25,
        verificationStatus: "verified",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(business.rating).toBe(4.5);
      expect(business.reviewCount).toBe(25);
    });

    it("should allow null rating", () => {
      const business: Business = {
        id: "test-id",
        ownerId: "owner-id",
        name: "Test Business",
        description: "Test description",
        categoryId: "cat-1",
        rating: null,
        reviewCount: 0,
        verificationStatus: "unverified",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(business.rating).toBeNull();
      expect(business.reviewCount).toBe(0);
    });
  });
});
