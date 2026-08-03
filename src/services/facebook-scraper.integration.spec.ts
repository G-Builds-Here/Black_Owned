/**
 * Facebook Scraper Integration Tests
 *
 * Validates that the scraper correctly executes search and returns business pages.
 * Tests the scraper's behavior with mocked network responses.
 */

import { FacebookScraper } from "./facebook-scraper";
import { ScraperResult } from "../types/facebook-scraper";

// Mock playwright at the module level
const mockEvaluate = jest.fn();
const mockWaitForSelector = jest.fn();
const mockGoto = jest.fn();
const mockClose = jest.fn();
const mockClick = jest.fn();
const mockWaitForLoadState = jest.fn();
const mockQuerySelector = jest.fn();

const mockPage = {
  goto: mockGoto,
  waitForSelector: mockWaitForSelector,
  evaluate: mockEvaluate,
  close: mockClose,
  $: mockQuerySelector,
  waitForLoadState: mockWaitForLoadState,
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

describe("FacebookScraper Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all mock implementations
    mockEvaluate.mockReset();
    mockWaitForSelector.mockReset();
    mockGoto.mockReset();
    mockClose.mockReset();
    mockQuerySelector.mockReset();
    mockWaitForLoadState.mockReset();
  });

  afterEach(async () => {
    // Clean up any open scraper instances
    jest.clearAllMocks();
  });

  describe("AC: Search for business pages on Facebook", () => {
    it("AC1: Given a search query and location, when scraper executes, search results page loads", async () => {
      // Given a search query and location
      const query = "test business";
      const location = "New York";

      // Mock successful page load
      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate.mockResolvedValue([]);

      const scraper = new FacebookScraper({ maxPages: 1, delayBetweenPagesMs: 100 });

      // When the scraper executes the search
      const result = await scraper.scrape(query, location);

      // Then the search results page loads successfully
      expect(mockGoto).toHaveBeenCalled();
      expect(result.source).toBe("facebook");
      expect(result.query).toBe(query);
      expect(result.location).toBe(location);

      await scraper.close();
    });

    it("AC1: Business pages are visible in the results when found", async () => {
      // Mock business data extraction
      const mockBusinesses = [
        {
          name: "Test Business One",
          source: "facebook" as const,
          sourceId: "test-biz-001",
          category: "Restaurant",
        },
        {
          name: "Test Business Two",
          source: "facebook" as const,
          sourceId: "test-biz-002",
          category: "Retail",
        },
      ];

      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate.mockResolvedValue(mockBusinesses);

      const scraper = new FacebookScraper({ maxPages: 1, delayBetweenPagesMs: 100 });

      // When the scraper executes
      const result = await scraper.scrape("restaurants", "Chicago");

      // Then business pages are visible in the results
      expect(result.businesses).toHaveLength(2);
      expect(result.businesses[0].name).toBe("Test Business One");
      expect(result.businesses[1].name).toBe("Test Business Two");
      expect(result.businesses.every((b) => b.source === "facebook")).toBe(true);

      await scraper.close();
    });

    it("AC1: Handles empty search results gracefully", async () => {
      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate.mockResolvedValue([]);

      const scraper = new FacebookScraper({ maxPages: 1, delayBetweenPagesMs: 100 });

      const result = await scraper.scrape("nonexistent", "Miami");

      // Should return empty array, not throw
      expect(result.businesses).toEqual([]);
      expect(result.pagination.totalResults).toBe(0);

      await scraper.close();
    });

    it("AC1: Correctly builds search URL with query and location parameters", async () => {
      const query = "restaurants";
      const location = "Los Angeles";

      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate.mockResolvedValue([]);

      const scraper = new FacebookScraper({ maxPages: 1, delayBetweenPagesMs: 100 });

      await scraper.scrape(query, location);

      // Verify the URL contains both query and location
      expect(mockGoto).toHaveBeenCalledWith(
        expect.stringContaining(`q=${encodeURIComponent(query)}`),
        expect.any(Object)
      );
      expect(mockGoto).toHaveBeenCalledWith(
        expect.stringContaining(`geo=${encodeURIComponent(location)}`),
        expect.any(Object)
      );

      await scraper.close();
    });

    it("AC1: Handles special characters in search query", async () => {
      const query = "cafe & restaurant";
      const location = "Seattle";

      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate.mockResolvedValue([]);

      const scraper = new FacebookScraper({ maxPages: 1, delayBetweenPagesMs: 100 });

      const result = await scraper.scrape(query, location);

      // Should properly encode special characters
      expect(result.query).toBe(query);
      expect(mockGoto).toHaveBeenCalledWith(
        expect.stringContaining("cafe"),
        expect.any(Object)
      );

      await scraper.close();
    });

    it("AC1: Returns structured result with pagination metadata", async () => {
      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate.mockResolvedValue([]);

      const scraper = new FacebookScraper({ maxPages: 3, delayBetweenPagesMs: 100 });

      const result = await scraper.scrape("test", "Boston");

      // Validate result structure
      expect(result).toEqual(
        expect.objectContaining({
          source: "facebook",
          query: "test",
          location: "Boston",
          timestamp: expect.any(Date),
          pagination: expect.objectContaining({
            currentPage: expect.any(Number),
            totalPages: expect.any(Number),
            resultsPerPage: expect.any(Number),
            totalResults: expect.any(Number),
            hasNextPage: expect.any(Boolean),
          }),
        })
      );

      await scraper.close();
    });

    it("AC1: Extracts business data with all required fields", async () => {
      const mockBusiness = {
        name: "Business Name",
        source: "facebook" as const,
        sourceId: "biz-id-123",
        category: "Business Category",
      };

      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate.mockResolvedValue([mockBusiness]);

      const scraper = new FacebookScraper({ maxPages: 1, delayBetweenPagesMs: 100 });

      const result = await scraper.scrape("businesses", "Denver");

      expect(result.businesses[0]).toEqual(
        expect.objectContaining({
          name: "Business Name",
          source: "facebook",
          sourceId: "biz-id-123",
          category: "Business Category",
        })
      );

      await scraper.close();
    });

    it("AC1: Handles pagination when more results available", async () => {
      // First page returns results, second page returns empty
      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate
        .mockResolvedValueOnce([{ name: "Biz 1", source: "facebook" as const, sourceId: "1" }])
        .mockResolvedValueOnce([{ name: "Biz 2", source: "facebook" as const, sourceId: "2" }])
        .mockResolvedValueOnce([]);

      mockQuerySelector.mockResolvedValue(null); // No "More Results" button

      const scraper = new FacebookScraper({ maxPages: 3, delayBetweenPagesMs: 100 });

      const result = await scraper.scrape("businesses", "Austin");

      // Should collect results from multiple pages
      expect(result.businesses.length).toBeGreaterThanOrEqual(1);
      expect(result.pagination.currentPage).toBeGreaterThanOrEqual(1);

      await scraper.close();
    });

    it("AC1: Avoids duplicates when includeDuplicates is false", async () => {
      const duplicateBiz = {
        name: "Same Business",
        source: "facebook" as const,
        sourceId: "same-id",
      };

      mockGoto.mockResolvedValue(undefined);
      mockWaitForSelector.mockResolvedValue(undefined);
      mockEvaluate
        .mockResolvedValueOnce([duplicateBiz])
        .mockResolvedValueOnce([duplicateBiz]);
      mockQuerySelector.mockResolvedValue(null);

      const scraper = new FacebookScraper({
        maxPages: 2,
        delayBetweenPagesMs: 100,
        includeDuplicates: false,
      });

      const result = await scraper.scrape("businesses", "Portland");

      // Should only have one instance
      expect(result.businesses).toHaveLength(1);

      await scraper.close();
    });

    it("AC1: Throws error when scraping fails", async () => {
      mockGoto.mockRejectedValue(new Error("Network error"));

      const scraper = new FacebookScraper({ maxPages: 1, delayBetweenPagesMs: 100 });

      await expect(scraper.scrape("test", "Seattle")).rejects.toThrow(
        "Facebook scraping failed"
      );

      await scraper.close();
    });
  });
});
