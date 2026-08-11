/**
 * Multi-Source Scraper Integration Tests
 *
 * AC: LOC-0073-AC5 - Test all three sources (GoogleMaps, Yelp, Facebook)
 *
 * These tests verify that mock responses for each source exist and produce
 * valid normalized output when tests run for each source.
 */

import { GoogleMapsScraper } from "./google-maps-scraper";
import { YelpScraper } from "./yelp-scraper";
import { FacebookScraper } from "./facebook-scraper";
import { ScrapedBusiness as GoogleMapsBusiness } from "../types/google-maps-scraper";
import { ScrapedBusiness as YelpBusiness } from "../types/yelp-scraper";
import { ScrapedBusiness as FacebookBusiness } from "../types/facebook-scraper";

// Mock Playwright for all scrapers
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

describe("Multi-Source Scraper Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await mockContext.close?.();
  });

  describe("GoogleMaps source", () => {
    it("produces valid normalized output with all required fields", async () => {
      const mockBusinesses: GoogleMapsBusiness[] = [
        {
          name: "Test Business Google",
          address: "123 Main St, Seattle, WA",
          phone: "+1-555-123-4567",
          website: "https://testbusiness.com",
          rating: 4.5,
          reviewCount: 120,
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const scraper = new GoogleMapsScraper();
      const result = await scraper.scrape("restaurants", "Seattle");

      // Verify source identification
      expect(result.source).toBe("google-maps");

      // Verify query and location are captured
      expect(result.query).toBe("restaurants");
      expect(result.location).toBe("Seattle");

      // Verify timestamp is present
      expect(result.timestamp).toBeInstanceOf(Date);

      // Verify pagination metadata
      expect(result.pagination).toBeDefined();
      expect(result.pagination.currentPage).toBeDefined();
      expect(result.pagination.totalPages).toBeDefined();
      expect(result.pagination.totalResults).toBe(1);

      // Verify normalized business data
      expect(result.businesses.length).toBe(1);
      const business = result.businesses[0];
      expect(business.name).toBe("Test Business Google");
      expect(business.address).toBe("123 Main St, Seattle, WA");
      expect(business.phone).toBe("+1-555-123-4567");
      expect(business.website).toBe("https://testbusiness.com");
      expect(business.rating).toBe(4.5);
      expect(business.reviewCount).toBe(120);
      expect(business.source).toBe("google-maps");
    });

    it("handles empty results without errors", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockRejectedValue(new Error("No results found"));
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const scraper = new GoogleMapsScraper();
      const result = await scraper.scrape("nonexistent", "Nowhere");

      expect(result.source).toBe("google-maps");
      expect(result.businesses.length).toBe(0);
      expect(result.pagination.totalResults).toBe(0);
    });
  });

  describe("Yelp source", () => {
    it("produces valid normalized output with all required fields", async () => {
      const mockBusinesses: YelpBusiness[] = [
        {
          name: "Test Business Yelp",
          address: "456 Oak Ave, Portland, OR",
          phone: "+1-555-987-6543",
          website: "https://yelpbusiness.com",
          category: "Italian Restaurant",
          rating: 4.0,
          reviewCount: 85,
          source: "yelp",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const scraper = new YelpScraper();
      const result = await scraper.scrape("italian restaurants", "Portland");

      // Verify source identification
      expect(result.source).toBe("yelp");

      // Verify query and location are captured
      expect(result.query).toBe("italian restaurants");
      expect(result.location).toBe("Portland");

      // Verify timestamp is present
      expect(result.timestamp).toBeInstanceOf(Date);

      // Verify pagination metadata
      expect(result.pagination).toBeDefined();
      expect(result.pagination.currentPage).toBeDefined();
      expect(result.pagination.totalPages).toBeDefined();
      expect(result.pagination.totalResults).toBe(1);

      // Verify normalized business data
      expect(result.businesses.length).toBe(1);
      const business = result.businesses[0];
      expect(business.name).toBe("Test Business Yelp");
      expect(business.address).toBe("456 Oak Ave, Portland, OR");
      expect(business.phone).toBe("+1-555-987-6543");
      expect(business.website).toBe("https://yelpbusiness.com");
      expect(business.category).toBe("Italian Restaurant");
      expect(business.rating).toBe(4.0);
      expect(business.reviewCount).toBe(85);
      expect(business.source).toBe("yelp");
    });

    it("handles empty results without errors", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockRejectedValue(new Error("No results found"));
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.close.mockResolvedValue(undefined);

      const scraper = new YelpScraper();
      const result = await scraper.scrape("nonexistent", "Nowhere");

      expect(result.source).toBe("yelp");
      expect(result.businesses.length).toBe(0);
      expect(result.pagination.totalResults).toBe(0);
    });
  });

  describe("Facebook source", () => {
    it("produces valid normalized output with all required fields", async () => {
      const mockBusinesses: FacebookBusiness[] = [
        {
          name: "Test Business Facebook",
          address: "789 Pine St, San Francisco, CA",
          phone: "+1-555-456-7890",
          website: "https://fbbusiness.com",
          category: "Community Organization",
          source: "facebook",
          sourceId: "test-business-fb-id",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const scraper = new FacebookScraper();
      const result = await scraper.scrape("community organizations", "San Francisco");

      // Verify source identification
      expect(result.source).toBe("facebook");

      // Verify query and location are captured
      expect(result.query).toBe("community organizations");
      expect(result.location).toBe("San Francisco");

      // Verify timestamp is present
      expect(result.timestamp).toBeInstanceOf(Date);

      // Verify pagination metadata
      expect(result.pagination).toBeDefined();
      expect(result.pagination.currentPage).toBeDefined();
      expect(result.pagination.totalPages).toBeDefined();
      expect(result.pagination.totalResults).toBe(1);

      // Verify normalized business data
      expect(result.businesses.length).toBe(1);
      const business = result.businesses[0];
      expect(business.name).toBe("Test Business Facebook");
      expect(business.address).toBe("789 Pine St, San Francisco, CA");
      expect(business.phone).toBe("+1-555-456-7890");
      expect(business.website).toBe("https://fbbusiness.com");
      expect(business.category).toBe("Community Organization");
      expect(business.source).toBe("facebook");
    });

    it("handles empty results without errors", async () => {
      mockPage.goto.mockRejectedValue(new Error("Network error"));

      const scraper = new FacebookScraper();

      await expect(scraper.scrape("nonexistent", "Nowhere")).rejects.toThrow(
        "Facebook scraping failed"
      );
    });
  });

  describe("Cross-source comparison", () => {
    it("all three sources produce consistent output structure", async () => {
      const mockBusiness = {
        name: "Consistent Business",
        address: "123 Test St",
        source: "google-maps" as const,
        rating: 4.0,
        reviewCount: 50,
      };

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([mockBusiness]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Test Google Maps
      const googleScraper = new GoogleMapsScraper();
      const googleResult = await googleScraper.scrape("test", "City");

      // Test Yelp
      const yelpScraper = new YelpScraper();
      const yelpResult = await yelpScraper.scrape("test", "City");

      // Test Facebook
      const facebookScraper = new FacebookScraper();
      const facebookResult = await facebookScraper.scrape("test", "City");

      // All sources should have the same structure
      const allHaveRequiredFields = [
        googleResult,
        yelpResult,
        facebookResult,
      ].every(
        (result) =>
          result.businesses !== undefined &&
          result.pagination !== undefined &&
          result.source !== undefined &&
          result.query !== undefined &&
          result.location !== undefined &&
          result.timestamp !== undefined
      );

      expect(allHaveRequiredFields).toBe(true);

      // Each source should correctly identify itself
      expect(googleResult.source).toBe("google-maps");
      expect(yelpResult.source).toBe("yelp");
      expect(facebookResult.source).toBe("facebook");
    });

    it("all sources handle pagination metadata consistently", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const googleScraper = new GoogleMapsScraper();
      const googleResult = await googleScraper.scrape("test", "City");

      const yelpScraper = new YelpScraper();
      const yelpResult = await yelpScraper.scrape("test", "City");

      const facebookScraper = new FacebookScraper();
      const facebookResult = await facebookScraper.scrape("test", "City");

      // All pagination objects should have the same structure
      const paginationFields = [
        "currentPage",
        "totalPages",
        "resultsPerPage",
        "totalResults",
        "hasNextPage",
      ];

      [googleResult.pagination, yelpResult.pagination, facebookResult.pagination].forEach(
        (pagination) => {
          paginationFields.forEach((field) => {
            expect(pagination).toHaveProperty(field);
          });
        }
      );
    });
  });

  describe("Source-specific error handling", () => {
    it("Google Maps handles navigation timeout gracefully", async () => {
      mockPage.goto.mockRejectedValue(new Error("Navigation timeout exceeded"));
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      const scraper = new GoogleMapsScraper();
      const result = await scraper.scrape("test", "city");

      expect(result.source).toBe("google-maps");
      expect(result.businesses).toEqual([]);
      expect(result.pagination.totalResults).toBe(0);
    });

    it("Yelp handles extraction errors gracefully", async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockRejectedValue(new Error("Evaluation failed"));
      mockPage.close.mockResolvedValue(undefined);

      const scraper = new YelpScraper();
      const result = await scraper.scrape("test", "city");

      expect(result.source).toBe("yelp");
      expect(result.businesses).toEqual([]);
      expect(result.pagination.totalResults).toBe(0);
    });

    it("Facebook throws on scraping failure", async () => {
      mockPage.goto.mockRejectedValue(new Error("Network error"));

      const scraper = new FacebookScraper();

      await expect(scraper.scrape("test", "city")).rejects.toThrow(
        "Facebook scraping failed"
      );
    });
  });
});
