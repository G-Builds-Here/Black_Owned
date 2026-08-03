/**
 * Google Maps Scraper Tests
 *
 * Tests for the Google Maps scraper with pagination support.
 */

import {
  GoogleMapsScraper,
  createGoogleMapsScraper,
} from "./google-maps-scraper";
import { ScrapedBusiness, ScraperResult } from "../types/google-maps-scraper";

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

describe("GoogleMapsScraper", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = createGoogleMapsScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("constructor", () => {
    it("creates scraper with default options", () => {
      const defaultScraper = createGoogleMapsScraper();
      expect(defaultScraper).toBeInstanceOf(GoogleMapsScraper);
    });

    it("creates scraper with custom options", () => {
      const customScraper = createGoogleMapsScraper({
        maxPages: 5,
        delayBetweenPagesMs: 2000,
        includeDuplicates: true,
      });
      expect(customScraper).toBeInstanceOf(GoogleMapsScraper);
    });
  });

  describe("scrape with pagination", () => {
    it("handles single page of results (less than 10)", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Business 1",
          address: "123 Main St",
          source: "google-maps",
          rating: 4.5,
          reviewCount: 100,
        },
        {
          name: "Business 2",
          address: "456 Oak Ave",
          source: "google-maps",
          rating: 4.0,
          reviewCount: 50,
        },
      ] as ScrapedBusiness[];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null); // No next button
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBe(2);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.source).toBe("google-maps");
    });

    it("handles multiple pages of results (more than 10)", async () => {
      const page1Businesses: ScrapedBusiness[] = Array.from(
        { length: 10 },
        (_, i) => ({
          name: `Business ${i + 1}`,
          address: `${i + 1} Street`,
          source: "google-maps",
          rating: 4.0 + (i % 2),
          reviewCount: 10 + i,
        })
      );

      const page2Businesses: ScrapedBusiness[] = Array.from(
        { length: 5 },
        (_, i) => ({
          name: `Business ${i + 11}`,
          address: `${i + 11} Street`,
          source: "google-maps",
          rating: 3.5,
          reviewCount: 20,
        })
      );

      let nextCallCount = 0;
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([...page1Businesses, ...page2Businesses]);
      mockPage.$.mockImplementation(() => {
        nextCallCount++;
        // First call returns null (no next button on first page check),
        // second call returns button (for pagination)
        if (nextCallCount === 2) {
          return Promise.resolve({
            click: jest.fn(),
            isVisible: jest.fn().mockResolvedValue(true),
            isDisabled: jest.fn().mockResolvedValue(false),
          });
        }
        return Promise.resolve(null);
      });
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBeGreaterThanOrEqual(10);
      expect(result.pagination.totalPages).toBeGreaterThanOrEqual(1);
      expect(result.pagination.totalResults).toBeGreaterThanOrEqual(10);
      expect(result.source).toBe("google-maps");
    });

    it("prevents duplicate businesses across pages", async () => {
      const page1Businesses: ScrapedBusiness[] = [
        { name: "Business A", address: "1st St", source: "google-maps", rating: 4.0 },
        { name: "Business B", address: "2nd St", source: "google-maps", rating: 4.5 },
      ];

      const page2Businesses: ScrapedBusiness[] = [
        { name: "Business A", address: "1st St", source: "google-maps", rating: 4.0 }, // Duplicate
        { name: "Business C", address: "3rd St", source: "google-maps", rating: 3.5 },
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
      const scraperWithLimit = createGoogleMapsScraper({ maxPages: 2 });

      const page1Businesses: ScrapedBusiness[] = Array.from(
        { length: 10 },
        (_, i) => ({
          name: `Business ${i + 1}`,
          address: `${i + 1} Street`,
          source: "google-maps",
        })
      );

      const page2Businesses: ScrapedBusiness[] = Array.from(
        { length: 10 },
        (_, i) => ({
          name: `Business ${i + 11}`,
          address: `${i + 11} Street`,
          source: "google-maps",
        })
      );

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([...page1Businesses, ...page2Businesses]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraperWithLimit.scrape("restaurants", "New York");

      // Should have at most 20 businesses (2 pages x 10 results)
      expect(result.businesses.length).toBeLessThanOrEqual(20);
      expect(result.pagination.totalPages).toBeLessThanOrEqual(2);
    });

    it("navigates to correct Google Maps search URL", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      await scraper.scrape("Italian restaurants", "Seattle, WA");

      expect(mockPage.goto).toHaveBeenCalled();
      const callArgs = mockPage.goto.mock.calls[0];
      expect(callArgs[0]).toContain("google.com/maps/search");
      expect(callArgs[0]).toContain("Italian%20restaurants");
      expect(callArgs[0]).toContain("Seattle%2C%20WA");
    });

    it("handles empty results gracefully", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockRejectedValue(
        new Error("Selector not found")
      );
      mockPage.evaluate.mockResolvedValue([]); // Empty results
      mockPage.$.mockResolvedValue(null); // No next button
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape(
        "nonexistentbusiness12345",
        "Nowhere City"
      );

      expect(result.businesses.length).toBe(0);
      expect(result.pagination.totalResults).toBe(0);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.source).toBe("google-maps");
    });

    it("includes phone and website when available", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Test Business",
          address: "123 Test St",
          phone: "555-1234",
          website: "https://test.com",
          source: "google-maps",
          rating: 4.5,
          reviewCount: 50,
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("test", "City");

      expect(result.businesses[0].phone).toBe("555-1234");
      expect(result.businesses[0].website).toBe("https://test.com");
    });
  });

  describe("error handling", () => {
    it("handles browser initialization failure", async () => {
      // Mock browser launch to fail
      const { chromium } = await import("playwright");
      (chromium.launch as jest.Mock).mockRejectedValueOnce(
        new Error("Browser launch failed")
      );

      await expect(scraper.scrape("test", "city")).rejects.toThrow(
        "Failed to initialize browser"
      );

      // Reset mock for cleanup
      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);
    });

    it("handles page navigation timeout", async () => {
      mockPage.goto.mockRejectedValue(
        new Error("Navigation timeout exceeded")
      );
      mockPage.evaluate.mockResolvedValue([]); // Empty results on error
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("test", "city");

      // Should return partial result with empty businesses
      expect(result.businesses).toEqual([]);
      expect(result.pagination.totalResults).toBe(0);
    });

    it("handles extraction errors gracefully", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockRejectedValue(
        new Error("Evaluation failed")
      );
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const result = await scraper.scrape("test", "city");

      // Should return empty businesses but not throw
      expect(result.businesses).toEqual([]);
      expect(result.source).toBe("google-maps");
    });
  });

  describe("close", () => {
    it("closes browser and context", async () => {
      // Initialize first
      await scraper["initialize"]();

      await scraper.close();

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it("is safe to call multiple times", async () => {
      await scraper.close();
      await scraper.close(); // Should not throw
    });
  });

  describe("getJobState", () => {
    it("returns null when not actively scraping", () => {
      const state = scraper.getJobState();
      expect(state).toBeNull();
    });
  });
});
