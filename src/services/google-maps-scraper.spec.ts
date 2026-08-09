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
jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

describe("GoogleMapsScraper", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset the mock implementation to throw by default
    (await import("playwright")).chromium.launch.mockRejectedValue(new Error("Mock not configured for this test"));
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
          category: "Restaurant",
        },
        {
          name: "Business 2",
          address: "456 Oak Ave",
          source: "google-maps",
          rating: 4.0,
          reviewCount: 50,
          category: "Cafe",
        },
      ] as ScrapedBusiness[];

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(mockBusinesses),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockReturnValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

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
          rating: 4.5,
          reviewCount: 20,
        })
      );

      let evaluateCallCount = 0;
      let goToNextPageCallCount = 0;

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) return page1Businesses;
          if (evaluateCallCount === 2) return page2Businesses;
          return [];
        }),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockImplementation((selector: string) => {
          // Track calls to detect when goToNextPage is being called
          // goToNextPage tries multiple selectors - first successful one returns button
          if (selector.includes('aria-label*="Next"') || selector.includes('class*="next"')) {
            goToNextPageCallCount++;
            // First goToNextPage call (page 1 -> 2) returns button, second (page 2 -> 3) returns null
            if (goToNextPageCallCount === 1) {
              return Promise.resolve({
                click: jest.fn().mockResolvedValue(undefined),
                isVisible: jest.fn().mockResolvedValue(true),
                isDisabled: jest.fn().mockResolvedValue(false),
              });
            }
          }
          return Promise.resolve(null);
        }),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBe(15);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNextPage).toBe(false);
    });

    it("handles duplicate detection across pages", async () => {
      const page1Businesses: ScrapedBusiness[] = [
        { name: "Business 1", address: "1 Street", source: "google-maps", rating: 4.0, reviewCount: 10 },
        { name: "Business 2", address: "2 Street", source: "google-maps", rating: 4.0, reviewCount: 10 },
      ];

      const page2Businesses: ScrapedBusiness[] = [
        { name: "Business 1", address: "1 Street", source: "google-maps", rating: 4.0, reviewCount: 10 },
        { name: "Business 3", address: "3 Street", source: "google-maps", rating: 4.0, reviewCount: 10 },
      ];

      let evaluateCallCount = 0;
      let goToNextPageCallCount = 0;

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) return page1Businesses;
          if (evaluateCallCount === 2) return page2Businesses;
          return [];
        }),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockImplementation((selector: string) => {
          if (selector.includes('aria-label*="Next"') || selector.includes('class*="next"')) {
            goToNextPageCallCount++;
            if (goToNextPageCallCount === 1) {
              return Promise.resolve({
                click: jest.fn().mockResolvedValue(undefined),
                isVisible: jest.fn().mockResolvedValue(true),
                isDisabled: jest.fn().mockResolvedValue(false),
              });
            }
          }
          return Promise.resolve(null);
        }),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBe(3);
    });

    it("includes duplicates when configured", async () => {
      const page1Businesses: ScrapedBusiness[] = [
        { name: "Business 1", address: "1 Street", source: "google-maps", rating: 4.0, reviewCount: 10 },
      ];

      const page2Businesses: ScrapedBusiness[] = [
        { name: "Business 1", address: "1 Street", source: "google-maps", rating: 4.0, reviewCount: 10 },
      ];

      let evaluateCallCount = 0;
      let goToNextPageCallCount = 0;

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) return page1Businesses;
          if (evaluateCallCount === 2) return page2Businesses;
          return [];
        }),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockImplementation((selector: string) => {
          if (selector.includes('aria-label*="Next"') || selector.includes('class*="next"')) {
            goToNextPageCallCount++;
            if (goToNextPageCallCount === 1) {
              return Promise.resolve({
                click: jest.fn().mockResolvedValue(undefined),
                isVisible: jest.fn().mockResolvedValue(true),
                isDisabled: jest.fn().mockResolvedValue(false),
              });
            }
          }
          return Promise.resolve(null);
        }),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      const scraperWithDuplicates = createGoogleMapsScraper({ includeDuplicates: true });
      await scraperWithDuplicates.initialize();

      const result = await scraperWithDuplicates.scrape("restaurants", "New York");

      expect(result.businesses.length).toBe(2);
      await scraperWithDuplicates.close();
    });

    it("respects max pages limit", async () => {
      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      const scraper = createGoogleMapsScraper({ maxPages: 3 });
      await scraper.initialize();

      await scraper.scrape("restaurants", "New York");

      expect(mockPage.goto).toHaveBeenCalledTimes(1);
      await scraper.close();
    });
  });

  describe("error handling", () => {
    it("handles browser initialization failure", async () => {
      (await import("playwright")).chromium.launch.mockRejectedValueOnce(
        new Error("Browser launch failed")
      );

      const scraper = createGoogleMapsScraper();

      await expect(scraper.scrape("restaurants", "New York")).rejects.toThrow(
        "Browser launch failed"
      );

      await scraper.close();
    });

    it("handles page navigation timeout", async () => {
      const mockPage = {
        goto: jest.fn().mockRejectedValue(new Error("Navigation timeout")),
        waitForSelector: jest.fn().mockRejectedValue(new Error("Timeout")),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockReturnValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBe(0);
      expect(result.pagination.hasNextPage).toBe(false);
    });

    it("handles empty results", async () => {
      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockRejectedValue(new Error("Timeout")),
        evaluate: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockReturnValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      const result = await scraper.scrape("nonexistent", "Nowhere");

      expect(result.businesses.length).toBe(0);
      expect(result.source).toBe("google-maps");
    });
  });

  describe("user-agent rotation", () => {
    it("uses user-agent from rotator", async () => {
      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      let capturedUserAgent: string | undefined;
      const mockContext = {
        newPage: jest.fn().mockReturnValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockImplementation((options: any) => {
          capturedUserAgent = options?.userAgent;
          return mockContext;
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      await scraper.initialize();

      expect(capturedUserAgent).toBeDefined();
      expect(typeof capturedUserAgent).toBe("string");
      expect(capturedUserAgent).toContain("Mozilla/5.0");
    });
  });

  describe("business extraction", () => {
    it("extracts all business fields correctly", async () => {
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Test Business",
          address: "123 Test St",
          source: "google-maps",
          rating: 4.5,
          reviewCount: 50,
          category: "Italian Restaurant",
          phone: "555-1234",
          website: "https://test.com",
        },
      ];

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(mockBusinesses),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: jest.fn().mockReturnValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (await import("playwright")).chromium.launch.mockResolvedValue(mockBrowser);

      const result = await scraper.scrape("test", "City");

      expect(result.businesses[0].name).toBe("Test Business");
      expect(result.businesses[0].address).toBe("123 Test St");
      expect(result.businesses[0].rating).toBe(4.5);
      expect(result.businesses[0].reviewCount).toBe(50);
    });
  });
});
