/**
 * Google Maps Scraper Pagination Tests
 *
 * Tests for pagination verification - AC5 of LOC-0060
 * Ensures pagination handles edge cases: empty pages, duplicate results
 */

import { ScrapedBusiness, ScraperResult } from "../types/google-maps-scraper";

// Mock Playwright - must be before import
const mockPage = {
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  close: jest.fn(),
  $: jest.fn(),
  waitForLoadState: jest.fn(),
  isVisible: jest.fn(),
  isDisabled: jest.fn(),
  click: jest.fn(),
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

import { GoogleMapsScraper, createGoogleMapsScraper } from "./google-maps-scraper";

describe("GoogleMapsScraper - Pagination", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all mocks to default behavior
    mockPage.goto.mockReset();
    mockPage.waitForSelector.mockReset();
    mockPage.evaluate.mockReset();
    mockPage.waitForLoadState.mockReset();
    mockPage.close.mockReset();
    mockPage.$.mockReset();
    mockPage.isVisible.mockReset();
    mockPage.isDisabled.mockReset();
    mockPage.click.mockReset();
    mockContext.newPage.mockReset().mockReturnValue(mockPage);

    scraper = createGoogleMapsScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("pagination with more than 10 results", () => {
    it("should scrape all pages when more than 10 results exist", async () => {
      // Page 1: 10 businesses
      const page1Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 1}`,
        address: `${i + 1} Street`,
        source: "google-maps" as const,
        rating: 4.0,
        reviewCount: 10,
      }));

      // Page 2: 5 businesses
      const page2Businesses: ScrapedBusiness[] = [
        { name: "Business 11", address: "11th Street", source: "google-maps" as const, rating: 4.5, reviewCount: 25 },
        { name: "Business 12", address: "12th Street", source: "google-maps" as const, rating: 3.5, reviewCount: 15 },
        { name: "Business 13", address: "13th Street", source: "google-maps" as const, rating: 4.0, reviewCount: 20 },
        { name: "Business 14", address: "14th Street", source: "google-maps" as const, rating: 4.5, reviewCount: 30 },
        { name: "Business 15", address: "15th Street", source: "google-maps" as const, rating: 3.0, reviewCount: 5 },
      ];

      let evaluateCallCount = 0;
      mockPage.goto.mockResolvedValue(undefined);
      // Mock waitForSelector to handle both login prompt check and results list check
      mockPage.waitForSelector.mockImplementation((selector: string) => {
        // Return a mock element for results list selector
        if (selector.includes("resultsList") || selector.includes("feed")) {
          return Promise.resolve({} as any);
        }
        return Promise.resolve(undefined);
      });
      mockPage.evaluate.mockImplementation(() => {
        evaluateCallCount++;
        return evaluateCallCount === 1 ? page1Businesses : page2Businesses;
      });
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.close.mockResolvedValue(undefined);

      // Mock next button - only return button once to go from page 1 to page 2
      let nextButtonCallCount = 0;
      mockPage.$.mockImplementation((selector: string) => {
        // Check for Next button in any part of the selector
        if (selector.toLowerCase().includes("next")) {
          nextButtonCallCount++;
          if (nextButtonCallCount === 1) {
            return Promise.resolve({
              click: jest.fn(),
              isVisible: jest.fn().mockResolvedValue(true),
              isDisabled: jest.fn().mockResolvedValue(false),
            });
          }
          return Promise.resolve(null);
        }
        // Return null for login detection selectors
        return Promise.resolve(null);
      });

      const result = await scraper.scrape("restaurants", "New York");

      // Should have all 15 businesses from both pages
      expect(result.businesses.length).toBe(15);
      expect(result.pagination.currentPage).toBe(2);
      expect(result.pagination.totalResults).toBe(15);
      expect(result.source).toBe("google-maps");
    });

    it("should handle empty pages gracefully", async () => {
      // Page 1: 10 businesses
      const page1Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 1}`,
        address: `${i + 1} Street`,
        source: "google-maps" as const,
        rating: 4.0,
        reviewCount: 10,
      }));

      // Page 2: empty (edge case)
      const page2Businesses: ScrapedBusiness[] = [];

      let evaluateCallCount = 0;
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockImplementation(() => {
        evaluateCallCount++;
        return evaluateCallCount === 1 ? page1Businesses : page2Businesses;
      });
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.close.mockResolvedValue(undefined);

      // Mock next button
      let nextButtonCallCount = 0;
      mockPage.$.mockImplementation((selector: string) => {
        nextButtonCallCount++;
        if (selector.includes("Next") || selector.includes("next")) {
          if (nextButtonCallCount <= 2) {
            return {
              click: jest.fn(),
              isVisible: jest.fn().mockResolvedValue(true),
              isDisabled: jest.fn().mockResolvedValue(false),
            };
          }
          return null;
        }
        return null;
      });

      const result = await scraper.scrape("restaurants", "New York");

      // Should still have 10 businesses (empty page doesn't add anything)
      expect(result.businesses.length).toBe(10);
      expect(result.pagination.totalResults).toBe(10);
    });

    it("should prevent duplicate results across pages", async () => {
      // Page 1: 3 businesses
      const page1Businesses: ScrapedBusiness[] = [
        { name: "Business A", address: "1st St", source: "google-maps" as const, rating: 4.0, reviewCount: 10 },
        { name: "Business B", address: "2nd St", source: "google-maps" as const, rating: 4.5, reviewCount: 15 },
        { name: "Business C", address: "3rd St", source: "google-maps" as const, rating: 3.5, reviewCount: 5 },
      ];

      // Page 2: contains duplicate from page 1 + new business
      const page2Businesses: ScrapedBusiness[] = [
        { name: "Business A", address: "1st St", source: "google-maps" as const, rating: 4.0, reviewCount: 10 }, // Duplicate
        { name: "Business B", address: "2nd St", source: "google-maps" as const, rating: 4.5, reviewCount: 15 }, // Duplicate
        { name: "Business D", address: "4th St", source: "google-maps" as const, rating: 4.0, reviewCount: 20 }, // New
      ];

      let evaluateCallCount = 0;
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockImplementation(() => {
        evaluateCallCount++;
        return evaluateCallCount === 1 ? page1Businesses : page2Businesses;
      });
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.close.mockResolvedValue(undefined);

      // Mock next button - return button once to trigger pagination
      let nextButtonCallCount = 0;
      mockPage.$.mockImplementation((selector: string) => {
        if (selector.toLowerCase().includes("next")) {
          nextButtonCallCount++;
          if (nextButtonCallCount === 1) {
            return Promise.resolve({
              click: jest.fn(),
              isVisible: jest.fn().mockResolvedValue(true),
              isDisabled: jest.fn().mockResolvedValue(false),
            });
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await scraper.scrape("restaurants", "New York");

      // Should have only 4 unique businesses (not 6)
      const uniqueNames = new Set(result.businesses.map((b) => b.name));
      expect(uniqueNames.size).toBe(4);
      expect(result.businesses.length).toBe(4);
      expect(uniqueNames.has("Business A")).toBe(true);
      expect(uniqueNames.has("Business B")).toBe(true);
      expect(uniqueNames.has("Business C")).toBe(true);
      expect(uniqueNames.has("Business D")).toBe(true);
    });

    it("should stop pagination when no more pages available", async () => {
      const page1Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 1}`,
        address: `${i + 1} Street`,
        source: "google-maps" as const,
        rating: 4.0,
        reviewCount: 10,
      }));

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(page1Businesses);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.close.mockResolvedValue(undefined);

      // No next button available
      mockPage.$.mockResolvedValue(null);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBe(10);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.currentPage).toBe(1);
    });

    it("should respect maxPages limit", async () => {
      const scraperWithLimit = createGoogleMapsScraper({ maxPages: 2 });

      const page1Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 1}`,
        address: `${i + 1} Street`,
        source: "google-maps" as const,
        rating: 4.0,
        reviewCount: 10,
      }));

      const page2Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 11}`,
        address: `${i + 11} Street`,
        source: "google-maps" as const,
        rating: 4.0,
        reviewCount: 10,
      }));

      let evaluateCallCount = 0;
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockImplementation(() => {
        evaluateCallCount++;
        return evaluateCallCount === 1 ? page1Businesses : page2Businesses;
      });
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.close.mockResolvedValue(undefined);

      // Mock next button
      let nextButtonCallCount = 0;
      mockPage.$.mockImplementation((selector: string) => {
        nextButtonCallCount++;
        if (selector.includes("Next") || selector.includes("next")) {
          if (nextButtonCallCount <= 2) {
            return {
              click: jest.fn(),
              isVisible: jest.fn().mockResolvedValue(true),
              isDisabled: jest.fn().mockResolvedValue(false),
            };
          }
          return null;
        }
        return null;
      });

      const result = await scraperWithLimit.scrape("restaurants", "New York");

      // Should have at most 20 businesses (2 pages)
      expect(result.businesses.length).toBeLessThanOrEqual(20);
    });
  });
});
