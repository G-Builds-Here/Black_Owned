/**
 * Google Maps Scraper - Category Extraction Tests
 *
 * Tests for business category extraction per LOC-0063-AC4:
 * "Given a business page is visible, When the scraper extracts data,
 * Then business category is captured, And rating (if available) is captured,
 * And review count is captured"
 */

import {
  GoogleMapsScraper,
  createGoogleMapsScraper,
} from "./google-maps-scraper";
import { ScrapedBusiness } from "../types/google-maps-scraper";

// Mock Playwright
const mockPage = {
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  close: jest.fn(),
  $: jest.fn(),
  waitForLoadState: jest.fn(),
};

const mockContext = {
  newPage: jest.fn().mockReturnValue(mockPage),
  close: jest.fn(),
};

const mockBrowser = {
  newContext: jest.fn().mockReturnValue(mockContext),
  close: jest.fn(),
};

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

describe("GoogleMapsScraper - Category Extraction (LOC-0063-AC4)", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = createGoogleMapsScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("Category field presence", () => {
    it("ScrapedBusiness type includes categories field", () => {
      // AC4 requirement: "business category is captured"
      const businessWithCategory: ScrapedBusiness = {
        name: "Test Business",
        address: "123 Test St",
        source: "google-maps",
        rating: 4.5,
        reviewCount: 100,
        categories: ["Restaurant", "Italian"], // This field must exist
      };

      expect(businessWithCategory.categories).toBeDefined();
      expect(Array.isArray(businessWithCategory.categories)).toBe(true);
    });

    it("categories field is optional per AC4 'if available' requirement", () => {
      // AC4 states rating/reviewCount are "if available" - same applies to categories
      const businessWithoutCategory: ScrapedBusiness = {
        name: "Test Business",
        address: "123 Test St",
        source: "google-maps",
      };

      expect(businessWithoutCategory.name).toBe("Test Business");
      expect(businessWithoutCategory.categories).toBeUndefined();
    });
  });

  describe("Category extraction from page", () => {
    it("extracts single business category from DOM", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Joe's Pizza",
          address: "123 Main St",
          source: "google-maps",
          rating: 4.5,
          reviewCount: 150,
          categories: ["Pizza Place", "Italian Restaurant"],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("pizza", "Seattle");

      expect(result.businesses[0].categories).toBeDefined();
      expect(result.businesses[0].categories).toEqual(
        expect.arrayContaining(["Pizza Place"])
      );
    });

    it("extracts multiple categories for a single business", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Full Service Cafe",
          address: "456 Oak Ave",
          source: "google-maps",
          rating: 4.0,
          reviewCount: 75,
          categories: [
            "Cafe",
            "Coffee Shop",
            "Breakfast Restaurant",
            "Wifi Cafe",
          ],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("cafes", "Seattle");

      expect(result.businesses[0].categories).toHaveLength(4);
      expect(result.businesses[0].categories).toContain("Cafe");
      expect(result.businesses[0].categories).toContain("Coffee Shop");
    });

    it("handles businesses with no categories available", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Unknown Business",
          address: "789 Unknown Rd",
          source: "google-maps",
          rating: 3.5,
          reviewCount: 5,
          categories: [], // Empty array when no categories found
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("unknown", "City");

      expect(result.businesses[0].categories).toEqual([]);
    });
  });

  describe("AC4 Complete validation - Category, Rating, ReviewCount", () => {
    it("captures all three AC4 fields in single extraction", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Complete Business",
          address: "100 Complete St",
          source: "google-maps",
          rating: 4.8,
          reviewCount: 342,
          categories: ["Professional Services", "Consulting"],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("consulting", "Seattle");

      const business = result.businesses[0];

      // AC4: "business category is captured"
      expect(business.categories).toBeDefined();
      expect(business.categories).toHaveLength(2);

      // AC4: "rating (if available) is captured"
      expect(business.rating).toBeDefined();
      expect(business.rating).toBe(4.8);

      // AC4: "review count is captured"
      expect(business.reviewCount).toBeDefined();
      expect(business.reviewCount).toBe(342);
    });

    it("handles partial availability per AC4 'if available' clause", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Partial Business",
          address: "200 Partial St",
          source: "google-maps",
          // No rating available
          reviewCount: 25,
          categories: ["New Business"],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("new business", "Seattle");

      const business = result.businesses[0];

      // AC4 allows rating to be missing ("if available")
      expect(business.rating).toBeUndefined();

      // But reviewCount and categories should still be captured
      expect(business.reviewCount).toBe(25);
      expect(business.categories).toEqual(["New Business"]);
    });
  });
});
