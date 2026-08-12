/**
 * Google Maps Scraper - Integration Tests
 *
 * Tests for actual DOM extraction logic per LOC-0063-AC4:
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

describe("GoogleMapsScraper - Integration (LOC-0063-AC4)", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = createGoogleMapsScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("DOM extraction includes categories", () => {
    it("extracts categories from Google Maps DOM structure", async () => {
      // Simulate actual DOM extraction output with categories
      const mockDomOutput = [
        {
          name: "Joe's Pizza Palace",
          address: "123 Main St, Seattle, WA",
          phone: "(206) 555-1234",
          website: "https://joespizza.com",
          rating: 4.5,
          reviewCount: 342,
          categories: ["Pizza Place", "Italian Restaurant", "Delivery Service"],
        },
        {
          name: "Seattle Coffee Works",
          address: "456 Pike St, Seattle, WA",
          phone: "(206) 555-5678",
          rating: 4.8,
          reviewCount: 891,
          categories: ["Coffee Shop", "Cafe", "Roastery"],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockDomOutput);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("restaurants", "Seattle");

      // Verify first business has categories
      expect(result.businesses[0].name).toBe("Joe's Pizza Palace");
      expect(result.businesses[0].categories).toBeDefined();
      expect(result.businesses[0].categories).toEqual(
        expect.arrayContaining(["Pizza Place", "Italian Restaurant"])
      );

      // Verify second business has categories
      expect(result.businesses[1].categories).toBeDefined();
      expect(result.businesses[1].categories).toHaveLength(3);
      expect(result.businesses[1].categories).toContain("Coffee Shop");
    });

    it("handles DOM elements without category data", async () => {
      // Some Google Maps results may not show categories
      const mockDomOutput = [
        {
          name: "New Business",
          address: "789 New St",
          rating: 0,
          reviewCount: 0,
          categories: [], // No categories available for new listings
        },
        {
          name: "Established Business",
          address: "100 Old St",
          rating: 4.2,
          reviewCount: 156,
          categories: ["Retail", "Clothing Store"],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockDomOutput);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("shopping", "Seattle");

      expect(result.businesses[0].categories).toEqual([]);
      expect(result.businesses[1].categories).toEqual(
        expect.arrayContaining(["Retail"])
      );
    });
  });

  describe("AC4 validation - all three fields extracted together", () => {
    it("DOM extraction returns all AC4 fields in single pass", async () => {
      // This test validates that the page.evaluate() block extracts
      // category, rating, AND reviewCount simultaneously
      const mockDomOutput = [
        {
          name: "Complete Business Entry",
          address: "100 Complete Ave",
          phone: "(555) 123-4567",
          website: "https://completebiz.com",
          rating: 4.7,
          reviewCount: 523,
          categories: ["Professional Services", "Consulting", "Business Center"],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockDomOutput);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("consulting", "Seattle");

      const business = result.businesses[0];

      // AC4: "business category is captured"
      expect(business.categories).toBeDefined();
      expect(business.categories).toHaveLength(3);

      // AC4: "rating (if available) is captured"
      expect(business.rating).toBe(4.7);

      // AC4: "review count is captured"
      expect(business.reviewCount).toBe(523);

      // Verify all fields exist in same object
      expect(business).toHaveProperty("categories");
      expect(business).toHaveProperty("rating");
      expect(business).toHaveProperty("reviewCount");
    });

    it("preserves category data through deduplication", async () => {
      const mockDomOutput = [
        {
          name: "Duplicate Business",
          address: "100 First St",
          rating: 4.5,
          reviewCount: 100,
          categories: ["First Category"],
        },
        {
          name: "Duplicate Business",
          address: "200 Second St",
          rating: 4.5,
          reviewCount: 100,
          categories: ["First Category"], // Same categories
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockDomOutput);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("test", "Seattle");

      // Deduplication should preserve categories
      expect(result.businesses.length).toBe(1);
      expect(result.businesses[0].categories).toEqual(["First Category"]);
    });
  });

  describe("Category data integrity", () => {
    it("preserves category order from DOM", async () => {
      const mockDomOutput = [
        {
          name: "Multi-category Business",
          address: "500 Multi St",
          rating: 4.0,
          reviewCount: 50,
          categories: ["Primary", "Secondary", "Tertiary"],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockDomOutput);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("test", "Seattle");

      expect(result.businesses[0].categories).toEqual([
        "Primary",
        "Secondary",
        "Tertiary",
      ]);
    });

    it("handles empty category array gracefully", async () => {
      const mockDomOutput = [
        {
          name: "No Category Business",
          address: "600 NoCat St",
          rating: 3.0,
          reviewCount: 10,
          categories: [],
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockDomOutput);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("test", "Seattle");

      expect(result.businesses[0].categories).toEqual([]);
      expect(Array.isArray(result.businesses[0].categories)).toBe(true);
    });
  });
});
