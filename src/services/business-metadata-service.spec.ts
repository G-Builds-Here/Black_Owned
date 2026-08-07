/**
 * Business Metadata Service Tests
 *
 * Tests for business metadata extraction and normalization.
 */

import { extractBusinessMetadata, extractBatchMetadata } from "./business-metadata-service";
import { ScraperRawData } from "../types/business-metadata";

describe("Business Metadata Service", () => {
  describe("extractBusinessMetadata", () => {
    it("should extract valid metadata with all fields", () => {
      const rawData: ScraperRawData = {
        name: "Joe's BBQ",
        category: "BBQ Restaurant",
        rating: 4.5,
        reviewCount: 342,
        address: "123 Main St",
        phone: "555-1234",
        website: "https://joesbbq.com",
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata).toEqual({
        name: "Joe's BBQ",
        category: "food-dining",
        rating: 4.5,
        reviewCount: 342,
        address: "123 Main St",
        phone: "555-1234",
        website: "https://joesbbq.com",
      });
    });

    it("should map restaurant category to food-dining", () => {
      const rawData: ScraperRawData = {
        name: "Tasty Bites",
        category: "Italian Restaurant",
        rating: 4,
        reviewCount: 150,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("food-dining");
    });

    it("should map lawyer category to professional-services", () => {
      const rawData: ScraperRawData = {
        name: "Smith & Associates",
        category: "Personal Injury Lawyer",
        rating: 5,
        reviewCount: 89,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("professional-services");
    });

    it("should map gym category to health-wellness", () => {
      const rawData: ScraperRawData = {
        name: "FitLife Gym",
        category: "Fitness Center / Gym",
        rating: 4.2,
        reviewCount: 200,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("health-wellness");
    });

    it("should map auto repair to automotive", () => {
      const rawData: ScraperRawData = {
        name: "Quick Fix Auto",
        category: "Auto Mechanic",
        rating: 3.8,
        reviewCount: 45,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("automotive");
    });

    it("should map plumber to home-services", () => {
      const rawData: ScraperRawData = {
        name: "Reliable Plumbing",
        category: "Plumber",
        rating: 4.7,
        reviewCount: 120,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("home-services");
    });

    it("should map unknown category to other", () => {
      const rawData: ScraperRawData = {
        name: "Mystery Shop",
        category: "Unknown Category",
        rating: 3,
        reviewCount: 10,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("other");
    });

    it("should normalize rating from string format", () => {
      const rawData: ScraperRawData = {
        name: "Test Business",
        category: "Restaurant",
        rating: "4.5 stars",
        reviewCount: 100,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.rating).toBe(4.5);
    });

    it("should normalize rating from string with slash format", () => {
      const rawData: ScraperRawData = {
        name: "Test Business",
        category: "Restaurant",
        rating: "4/5",
        reviewCount: 100,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.rating).toBe(4);
    });

    it("should clamp rating to 5 maximum", () => {
      const rawData: ScraperRawData = {
        name: "Test Business",
        category: "Restaurant",
        rating: 6,
        reviewCount: 100,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Invalid rating format: 6");
    });

    it("should parse review count with K suffix", () => {
      const rawData: ScraperRawData = {
        name: "Popular Place",
        category: "Restaurant",
        rating: 4.5,
        reviewCount: "1.2K",
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.reviewCount).toBe(1200);
    });

    it("should parse review count with M suffix", () => {
      const rawData: ScraperRawData = {
        name: "Viral Spot",
        category: "Restaurant",
        rating: 4,
        reviewCount: "2.5M",
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.reviewCount).toBe(2500000);
    });

    it("should parse numeric review count", () => {
      const rawData: ScraperRawData = {
        name: "Test Business",
        category: "Restaurant",
        rating: 4,
        reviewCount: 500,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.reviewCount).toBe(500);
    });

    it("should handle review count with plus sign", () => {
      const rawData: ScraperRawData = {
        name: "Popular Place",
        category: "Restaurant",
        rating: 4,
        reviewCount: "500+",
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.reviewCount).toBe(500);
    });

    it("should fail when name is missing", () => {
      const rawData: ScraperRawData = {
        name: "",
        category: "Restaurant",
        rating: 4,
        reviewCount: 100,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Business name is required");
    });

    it("should fail when category is missing", () => {
      const rawData: ScraperRawData = {
        name: "Test Business",
        category: "",
        rating: 4,
        reviewCount: 100,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Business category is required");
    });

    it("should trim whitespace from name", () => {
      const rawData: ScraperRawData = {
        name: "  Test Business  ",
        category: "Restaurant",
        rating: 4,
        reviewCount: 100,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.name).toBe("Test Business");
    });

    it("should handle rating as number 0", () => {
      const rawData: ScraperRawData = {
        name: "New Business",
        category: "Restaurant",
        rating: 0,
        reviewCount: 0,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.rating).toBe(0);
    });

    it("should map retail store to retail-fashion", () => {
      const rawData: ScraperRawData = {
        name: "Fashion Boutique",
        category: "Clothing Store",
        rating: 4.2,
        reviewCount: 78,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("retail-fashion");
    });

    it("should map entertainment venue to entertainment", () => {
      const rawData: ScraperRawData = {
        name: "Game Arcade",
        category: "Entertainment Center",
        rating: 4.8,
        reviewCount: 234,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("entertainment");
    });

    it("should map school to education", () => {
      const rawData: ScraperRawData = {
        name: "Learning Academy",
        category: "Private School",
        rating: 4.6,
        reviewCount: 156,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("education");
    });

    it("should map bank to financial-services", () => {
      const rawData: ScraperRawData = {
        name: "Community Bank",
        category: "Bank and Credit Union",
        rating: 3.9,
        reviewCount: 89,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.category).toBe("financial-services");
    });

    it("should return 0 when rating string has no numeric value", () => {
      const rawData: ScraperRawData = {
        name: "Test Business",
        category: "Restaurant",
        rating: "no rating",
        reviewCount: 100,
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Invalid rating format: no rating");
    });

    it("should return 0 for invalid review count string", () => {
      const rawData: ScraperRawData = {
        name: "Test Business",
        category: "Restaurant",
        rating: 4,
        reviewCount: "invalid",
      };

      const result = extractBusinessMetadata(rawData);

      expect(result.success).toBe(true);
      expect(result.metadata?.reviewCount).toBe(0);
    });
  });

  describe("extractBatchMetadata", () => {
    it("should process multiple entries", () => {
      const rawDataList: ScraperRawData[] = [
        {
          name: "Business 1",
          category: "Restaurant",
          rating: 4,
          reviewCount: 100,
        },
        {
          name: "Business 2",
          category: "Lawyer",
          rating: 5,
          reviewCount: 50,
        },
      ];

      const results = extractBatchMetadata(rawDataList);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].metadata?.category).toBe("food-dining");
      expect(results[1].metadata?.category).toBe("professional-services");
    });

    it("should handle mixed success and failure results", () => {
      const rawDataList: ScraperRawData[] = [
        {
          name: "Valid Business",
          category: "Restaurant",
          rating: 4,
          reviewCount: 100,
        },
        {
          name: "",
          category: "Restaurant",
          rating: 4,
          reviewCount: 100,
        },
      ];

      const results = extractBatchMetadata(rawDataList);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });
});
