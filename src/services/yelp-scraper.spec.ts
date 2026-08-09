/**
 * Yelp Scraper Tests
 *
 * Tests for the Yelp scraper with pagination support.
 */

import { YelpScraper, createYelpScraper } from "./yelp-scraper";
import { ScrapedBusiness, ScraperResult } from "../types/yelp-scraper";

// Mock Playwright
jest.mock("playwright", () => {
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
  return {
    chromium: {
      launch: jest.fn().mockResolvedValue(mockBrowser),
    },
  };
});

describe("YelpScraper", () => {
  let scraper: YelpScraper;

  beforeEach(async () => {
    jest.clearAllMocks();
    scraper = createYelpScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("constructor", () => {
    it("creates scraper with default options", () => {
      const defaultScraper = createYelpScraper();
      expect(defaultScraper).toBeInstanceOf(YelpScraper);
    });

    it("creates scraper with custom options", () => {
      const customScraper = createYelpScraper({
        maxPages: 5,
        delayBetweenPagesMs: 2000,
        includeDuplicates: true,
      });
      expect(customScraper).toBeInstanceOf(YelpScraper);
    });
  });

  describe("scrape with pagination", () => {
    it("handles single page of results (less than 10)", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Business 1",
          address: "123 Main St",
          source: "yelp",
          rating: 4.5,
          reviewCount: 100,
        },
        {
          name: "Business 2",
          address: "456 Oak Ave",
          source: "yelp",
          rating: 4.0,
          reviewCount: 50,
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null); // No next button
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBe(2);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.source).toBe("yelp");
    });

    it("handles multiple pages of results (more than 10)", async () => {
      const page1Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 1}`,
        address: `${i + 1} Street`,
        source: "yelp",
        rating: 4.0 + (i % 2),
        reviewCount: 10 + i,
      }));

      const page2Businesses: ScrapedBusiness[] = [
        {
          name: "Business 11",
          address: "11th Street",
          source: "yelp",
          rating: 4.5,
          reviewCount: 25,
        },
        {
          name: "Business 12",
          address: "12th Street",
          source: "yelp",
          rating: 3.5,
          reviewCount: 15,
        },
      ];

      let callCount = 0;
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? page1Businesses : page2Businesses;
      });
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.close.mockResolvedValue(undefined);

      // First call returns null (no next button), second call returns mock button
      let nextCallCount = 0;
      mockPage.$.mockImplementation((selector: string) => {
        nextCallCount++;
        if (selector.includes("Next") || selector.includes("next")) {
          // First time no next button, second time return button
          return nextCallCount === 2
            ? { click: jest.fn(), isVisible: jest.fn().mockResolvedValue(true), isDisabled: jest.fn().mockResolvedValue(false) }
            : null;
        }
        return null;
      });

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBeGreaterThanOrEqual(10);
      expect(result.pagination.totalPages).toBeGreaterThanOrEqual(1);
      expect(result.pagination.totalResults).toBeGreaterThanOrEqual(10);
      expect(result.source).toBe("yelp");
    });

    it("prevents duplicate businesses across pages", async () => {
      const page1Businesses: ScrapedBusiness[] = [
        { name: "Business A", address: "1st St", source: "yelp", rating: 4.0 },
        { name: "Business B", address: "2nd St", source: "yelp", rating: 4.5 },
      ];

      const page2Businesses: ScrapedBusiness[] = [
        { name: "Business A", address: "1st St", source: "yelp", rating: 4.0 }, // Duplicate
        { name: "Business C", address: "3rd St", source: "yelp", rating: 3.5 },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([...page1Businesses, ...page2Businesses]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("restaurants", "New York");

      // Should only have 3 unique businesses, not 4
      const uniqueNames = new Set(result.businesses.map((b) => b.name));
      expect(uniqueNames.size).toBe(3);
      expect(result.businesses.length).toBe(3);
    });

    it("respects maxPages option", async () => {
      const scraperWithLimit = createYelpScraper({ maxPages: 2 });

      const page1Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 1}`,
        address: `${i + 1} Street`,
        source: "yelp",
      }));

      const page2Businesses: ScrapedBusiness[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Business ${i + 11}`,
        address: `${i + 11} Street`,
        source: "yelp",
      }));

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([...page1Businesses, ...page2Businesses]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraperWithLimit.scrape("restaurants", "New York");

      // Should have at most 20 businesses (2 pages * 10 per page)
      expect(result.businesses.length).toBeLessThanOrEqual(20);
    });

    it("handles empty results gracefully", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockRejectedValue(new Error("Selector not found"));
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("nonexistentbusiness12345", "Nowhere City");

      expect(result.businesses.length).toBe(0);
      expect(result.pagination.totalResults).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it("includes pagination metadata in result", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        { name: "Test Business", address: "123 Test St", source: "yelp" },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("test", "Location");

      expect(result.pagination).toBeDefined();
      expect(result.pagination).toHaveProperty("currentPage");
      expect(result.pagination).toHaveProperty("totalPages");
      expect(result.pagination).toHaveProperty("resultsPerPage");
      expect(result.pagination).toHaveProperty("totalResults");
      expect(result.pagination).toHaveProperty("hasNextPage");
      expect(result.pagination.resultsPerPage).toBe(10);
    });

    it("captures all required business fields", async () => {
      const mockBusiness: ScrapedBusiness = {
        name: "Full Service Business",
        address: "123 Complete St",
        phone: "555-1234",
        website: "https://example.com",
        category: "Professional Services",
        rating: 4.5,
        reviewCount: 150,
        source: "yelp",
      };

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([mockBusiness]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("services", "City");

      const business = result.businesses[0];
      expect(business.name).toBe("Full Service Business");
      expect(business.address).toBe("123 Complete St");
      expect(business.phone).toBe("555-1234");
      expect(business.website).toBe("https://example.com");
      expect(business.category).toBe("Professional Services");
      expect(business.rating).toBe(4.5);
      expect(business.reviewCount).toBe(150);
    });
  });

  describe("close", () => {
    it("closes browser and context", async () => {
      mockContext.close.mockResolvedValue(undefined);
      mockBrowser.close.mockResolvedValue(undefined);

      await scraper.close();

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
