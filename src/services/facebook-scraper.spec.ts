/**
 * Facebook Scraper Tests
 */

import { FacebookScraper } from "./facebook-scraper";
import { Browser, BrowserContext, Page } from "playwright";

// Mock playwright
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

describe("FacebookScraper", () => {
  let scraper: FacebookScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockPage.evaluate.mockReset();
    mockPage.goto.mockReset();
    mockPage.waitForSelector.mockReset();
    mockPage.close.mockReset();
    mockPage.$.mockReset();
    mockPage.waitForLoadState.mockReset();
    scraper = new FacebookScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("constructor", () => {
    it("should create scraper with default options", () => {
      const defaultScraper = new FacebookScraper();
      expect(defaultScraper).toBeDefined();
    });

    it("should accept custom options", () => {
      const customScraper = new FacebookScraper({
        maxPages: 10,
        delayBetweenPagesMs: 5000,
      });
      expect(customScraper).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("should launch chromium browser", async () => {
      await scraper.initialize();
      expect(mockBrowser.newContext).toHaveBeenCalled();
    });
  });

  describe("scrape", () => {
    it("should initialize browser before scraping", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);

      await scraper.scrape("restaurants", "New York");
      expect(mockBrowser.newContext).toHaveBeenCalled();
    });

    it("should navigate to Facebook search URL with query and location", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);

      await scraper.scrape("restaurants", "New York");

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining("q=restaurants"),
        expect.any(Object)
      );
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining("geo=New%20York"),
        expect.any(Object)
      );
    });

    it("should wait for page units selector to load", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);

      await scraper.scrape("restaurants", "New York");

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        expect.stringContaining("PageUnits"),
        expect.any(Object)
      );
    });

    it("should extract businesses from search results", async () => {
      const mockBusinesses = [
        {
          name: "Test Business",
          source: "facebook" as const,
          sourceId: "test-business-123",
          category: "Restaurant",
          phone: undefined,
          website: undefined,
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses).toHaveLength(1);
      expect(result.businesses[0].name).toBe("Test Business");
      expect(result.businesses[0].source).toBe("facebook");
    });

    it("should return correct pagination info", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.pagination).toEqual(
        expect.objectContaining({
          currentPage: expect.any(Number),
          totalPages: expect.any(Number),
          resultsPerPage: expect.any(Number),
          totalResults: expect.any(Number),
          hasNextPage: expect.any(Boolean),
        })
      );
    });

    it("should include query and location in result", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.query).toBe("restaurants");
      expect(result.location).toBe("New York");
    });

    it("should include timestamp in result", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it("should close page after scraping", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);

      await scraper.scrape("restaurants", "New York");

      expect(mockPage.close).toHaveBeenCalled();
    });

    it("should handle pagination when more results available", async () => {
      let callCount = 0;
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockImplementation(() => {
        callCount++;
        return callCount < 2 ? [{ name: `Business ${callCount}`, source: "facebook" as const, phone: undefined, website: undefined }] : [];
      });
      mockPage.$.mockResolvedValueOnce({ click: jest.fn() });

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses.length).toBeGreaterThan(0);
    });

    it("should avoid duplicates when includeDuplicates is false", async () => {
      const duplicateBusiness = {
        name: "Test Business",
        source: "facebook" as const,
        sourceId: "same-id",
      };

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate
        .mockResolvedValueOnce([duplicateBusiness])
        .mockResolvedValueOnce([duplicateBusiness]);
      mockPage.$.mockResolvedValue(null);

      const result = await scraper.scrape("restaurants", "New York");

      expect(result.businesses).toHaveLength(1);
    });

    it("should throw error when scraping fails", async () => {
      mockPage.goto.mockRejectedValue(new Error("Network error"));

      await expect(scraper.scrape("restaurants", "New York")).rejects.toThrow(
        "Facebook scraping failed"
      );
    });

    it("captures phone number when available", async () => {
      const mockBusinessWithPhone = {
        name: "Phone Business",
        phone: "555-9876",
        website: undefined,
        category: "Business",
        source: "facebook" as const,
        sourceId: "phone-business-123",
      };

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([mockBusinessWithPhone]);

      const result = await scraper.scrape("businesses", "City");

      expect(result.businesses[0].phone).toBe("555-9876");
    });

    it("captures website URL when available", async () => {
      const mockBusinessWithWebsite = {
        name: "Website Business",
        address: "789 Web Ave",
        website: "https://website.com",
        source: "facebook" as const,
      };

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([mockBusinessWithWebsite]);

      const result = await scraper.scrape("businesses", "City");

      expect(result.businesses[0].website).toBe("https://website.com");
    });

    it("handles businesses without phone or website", async () => {
      const mockBusinessMinimal = {
        name: "Minimal Business",
        source: "facebook" as const,
      };

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([mockBusinessMinimal]);

      const result = await scraper.scrape("businesses", "City");

      expect(result.businesses[0].phone).toBeUndefined();
      expect(result.businesses[0].website).toBeUndefined();
    });
  });

  describe("getJobState", () => {
    it("should return initial job state", () => {
      const state = scraper.getJobState("restaurants", "New York");

      expect(state).toEqual(
        expect.objectContaining({
          query: "restaurants",
          location: "New York",
          currentPage: 0,
          totalPages: 5,
          businessesCollected: [],
          isComplete: false,
        })
      );
    });
  });

  describe("close", () => {
    it("should close browser and context", async () => {
      await scraper.initialize();
      await scraper.close();

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
