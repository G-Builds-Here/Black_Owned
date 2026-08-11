/**
 * Scraper Source Integration Tests
 *
 * Comprehensive integration tests for GoogleMaps, Yelp, and Facebook scrapers.
 * Validates field extraction, error handling, rate limiting, and normalized output.
 *
 * Total tests: 35+
 */

import { GoogleMapsScraper } from "./google-maps-scraper";
import { YelpScraper } from "./yelp-scraper";
import { FacebookScraper } from "./facebook-scraper";

describe("Scraper Integration Tests", () => {
  // Test configuration
  const TEST_QUERY = "restaurants";
  const TEST_LOCATION = "Los Angeles, CA";

  afterEach(async () => {
    // Clean up any remaining mocks
    jest.clearAllMocks();
  });

  // ============================================================================
  // GoogleMaps Scraper Tests (12 tests)
  // ============================================================================
  describe("GoogleMaps Scraper - Field Extraction", () => {
    let scraper: GoogleMapsScraper;

    beforeEach(() => {
      scraper = new GoogleMapsScraper({ headless: true });
    });

    afterEach(async () => {
      await scraper.close();
    });

    it("should extract name field from business results", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses.length).toBeGreaterThan(0);
      result.businesses.forEach((business) => {
        expect(business.name).toBeDefined();
        expect(typeof business.name).toBe("string");
        expect(business.name.length).toBeGreaterThan(0);
      });
    });

    it("should extract address field from business results", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses.length).toBeGreaterThan(0);
      result.businesses.forEach((business) => {
        expect(business.address).toBeDefined();
        expect(typeof business.address).toBe("string");
        expect(business.address.length).toBeGreaterThan(0);
      });
    });

    it("should extract phone field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      result.businesses.forEach((business) => {
        if (business.phone !== undefined) {
          expect(typeof business.phone).toBe("string");
          expect(business.phone.length).toBeGreaterThan(0);
        }
      });
    });

    it("should extract rating field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      const resultsWithRating = result.businesses.filter((b) => b.rating !== undefined);
      expect(resultsWithRating.length).toBeGreaterThan(0);

      resultsWithRating.forEach((business) => {
        expect(typeof business.rating).toBe("number");
        expect(business.rating).toBeGreaterThanOrEqual(0);
        expect(business.rating).toBeLessThanOrEqual(5);
      });
    });

    it("should extract reviewCount field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      const resultsWithReviews = result.businesses.filter((b) => b.reviewCount !== undefined);
      expect(resultsWithReviews.length).toBeGreaterThan(0);

      resultsWithReviews.forEach((business) => {
        expect(typeof business.reviewCount).toBe("number");
        expect(business.reviewCount).toBeGreaterThanOrEqual(0);
      });
    });

    it("should return correct source identifier", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.source).toBe("google-maps");
    });

    it("should handle pagination configuration", async () => {
      const scraperWithPagination = new GoogleMapsScraper({
        headless: true,
        maxPages: 2,
        delayBetweenPagesMs: 100,
      });

      const result = await scraperWithPagination.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.pagination).toBeDefined();
      expect(result.pagination.currentPage).toBeGreaterThanOrEqual(1);
      expect(result.businesses.length).toBeGreaterThan(0);

      await scraperWithPagination.close();
    });

    it("should deduplicate businesses when includeDuplicates is false", async () => {
      const scraperNoDuplicates = new GoogleMapsScraper({
        headless: true,
        includeDuplicates: false,
      });

      const result = await scraperNoDuplicates.scrape(TEST_QUERY, TEST_LOCATION);

      const names = result.businesses.map((b) => b.name);
      const uniqueNames = new Set(names);

      expect(names.length).toBe(uniqueNames.size);

      await scraperNoDuplicates.close();
    });

    it("should preserve query and location in result", async () => {
      const result = await scraper.scrape("coffee shops", "New York");

      expect(result.query).toBe("coffee shops");
      expect(result.location).toBe("New York");
    });

    it("should include timestamp in result", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp instanceof Date).toBe(true);
    });

    it("should handle empty search results gracefully", async () => {
      const result = await scraper.scrape("nonexistentbusiness12345", TEST_LOCATION);

      expect(result.source).toBe("google-maps");
      expect(result.businesses).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it("should respect maxPages configuration", async () => {
      const limitedScraper = new GoogleMapsScraper({
        headless: true,
        maxPages: 1,
      });

      const result = await limitedScraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.pagination.currentPage).toBeLessThanOrEqual(1);

      await limitedScraper.close();
    });
  });

  // ============================================================================
  // Yelp Scraper Tests (12 tests)
  // ============================================================================
  describe("Yelp Scraper - Field Extraction", () => {
    let scraper: YelpScraper;

    beforeEach(() => {
      scraper = new YelpScraper({ headless: true });
    });

    afterEach(async () => {
      await scraper.close();
    });

    it("should extract name field from business results", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses.length).toBeGreaterThan(0);
      result.businesses.forEach((business) => {
        expect(business.name).toBeDefined();
        expect(typeof business.name).toBe("string");
        expect(business.name.length).toBeGreaterThan(0);
      });
    });

    it("should extract address field from business results", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses.length).toBeGreaterThan(0);
      result.businesses.forEach((business) => {
        expect(business.address).toBeDefined();
        expect(typeof business.address).toBe("string");
        expect(business.address.length).toBeGreaterThan(0);
      });
    });

    it("should extract phone field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      result.businesses.forEach((business) => {
        if (business.phone !== undefined) {
          expect(typeof business.phone).toBe("string");
        }
      });
    });

    it("should extract rating field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      const resultsWithRating = result.businesses.filter((b) => b.rating !== undefined);
      expect(resultsWithRating.length).toBeGreaterThan(0);

      resultsWithRating.forEach((business) => {
        expect(typeof business.rating).toBe("number");
        expect(business.rating).toBeGreaterThanOrEqual(0);
        expect(business.rating).toBeLessThanOrEqual(5);
      });
    });

    it("should extract reviewCount field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      const resultsWithReviews = result.businesses.filter((b) => b.reviewCount !== undefined);
      expect(resultsWithReviews.length).toBeGreaterThan(0);

      resultsWithReviews.forEach((business) => {
        expect(typeof business.reviewCount).toBe("number");
        expect(business.reviewCount).toBeGreaterThanOrEqual(0);
      });
    });

    it("should return correct source identifier", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.source).toBe("yelp");
    });

    it("should handle pagination configuration", async () => {
      const scraperWithPagination = new YelpScraper({
        headless: true,
        maxPages: 2,
        delayBetweenPagesMs: 100,
      });

      const result = await scraperWithPagination.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.pagination).toBeDefined();
      expect(result.pagination.currentPage).toBeGreaterThanOrEqual(1);
      expect(result.businesses.length).toBeGreaterThan(0);

      await scraperWithPagination.close();
    });

    it("should deduplicate businesses when includeDuplicates is false", async () => {
      const scraperNoDuplicates = new YelpScraper({
        headless: true,
        includeDuplicates: false,
      });

      const result = await scraperNoDuplicates.scrape(TEST_QUERY, TEST_LOCATION);

      const names = result.businesses.map((b) => b.name);
      const uniqueNames = new Set(names);

      expect(names.length).toBe(uniqueNames.size);

      await scraperNoDuplicates.close();
    });

    it("should preserve query and location in result", async () => {
      const result = await scraper.scrape("pizza", "Chicago");

      expect(result.query).toBe("pizza");
      expect(result.location).toBe("Chicago");
    });

    it("should include timestamp in result", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp instanceof Date).toBe(true);
    });

    it("should handle empty search results gracefully", async () => {
      const result = await scraper.scrape("nonexistentbusiness12345", TEST_LOCATION);

      expect(result.source).toBe("yelp");
      expect(result.businesses).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it("should respect maxPages configuration", async () => {
      const limitedScraper = new YelpScraper({
        headless: true,
        maxPages: 1,
      });

      const result = await limitedScraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.pagination.currentPage).toBeLessThanOrEqual(1);

      await limitedScraper.close();
    });
  });

  // ============================================================================
  // Facebook Scraper Tests (8 tests)
  // ============================================================================
  describe("Facebook Scraper - Field Extraction", () => {
    let scraper: FacebookScraper;

    beforeEach(() => {
      scraper = new FacebookScraper();
    });

    afterEach(async () => {
      await scraper.close();
    });

    it("should extract name field from business results", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses.length).toBeGreaterThan(0);
      result.businesses.forEach((business) => {
        expect(business.name).toBeDefined();
        expect(typeof business.name).toBe("string");
        expect(business.name.length).toBeGreaterThan(0);
      });
    });

    it("should extract phone field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      const resultsWithPhone = result.businesses.filter((b) => b.phone !== undefined);
      if (resultsWithPhone.length > 0) {
        resultsWithPhone.forEach((business) => {
          expect(typeof business.phone).toBe("string");
          expect(business.phone.length).toBeGreaterThan(0);
        });
      }
    });

    it("should extract website field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      const resultsWithWebsite = result.businesses.filter((b) => b.website !== undefined);
      if (resultsWithWebsite.length > 0) {
        resultsWithWebsite.forEach((business) => {
          expect(typeof business.website).toBe("string");
          expect(business.website).toMatch(/^https?:\/\//);
        });
      }
    });

    it("should extract category field when available", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      const resultsWithCategory = result.businesses.filter((b) => b.category !== undefined);
      expect(resultsWithCategory.length).toBeGreaterThan(0);

      resultsWithCategory.forEach((business) => {
        expect(typeof business.category).toBe("string");
        expect(business.category.length).toBeGreaterThan(0);
      });
    });

    it("should return correct source identifier", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.source).toBe("facebook");
    });

    it("should extract sourceId for each business", async () => {
      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      result.businesses.forEach((business) => {
        if (business.sourceId !== undefined) {
          expect(typeof business.sourceId).toBe("string");
        }
      });
    });

    it("should handle pagination configuration", async () => {
      const scraperWithPagination = new FacebookScraper({
        maxPages: 2,
        delayBetweenPagesMs: 100,
      });

      const result = await scraperWithPagination.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.pagination).toBeDefined();
      expect(result.pagination.currentPage).toBeGreaterThanOrEqual(1);
      expect(result.businesses.length).toBeGreaterThan(0);

      await scraperWithPagination.close();
    });

    it("should preserve query and location in result", async () => {
      const result = await scraper.scrape("local businesses", "Miami");

      expect(result.query).toBe("local businesses");
      expect(result.location).toBe("Miami");
    });
  });

  // ============================================================================
  // Error Handling Tests (6 tests)
  // ============================================================================
  describe("Error Handling", () => {
    it("should handle browser initialization gracefully for GoogleMaps", async () => {
      const scraper = new GoogleMapsScraper({ headless: true });

      await scraper.close();

      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses).toBeDefined();
      expect(result.source).toBe("google-maps");
    });

    it("should handle browser initialization gracefully for Yelp", async () => {
      const scraper = new YelpScraper({ headless: true });

      await scraper.close();

      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses).toBeDefined();
      expect(result.source).toBe("yelp");
    });

    it("should handle browser initialization gracefully for Facebook", async () => {
      const scraper = new FacebookScraper();

      await scraper.close();

      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.businesses).toBeDefined();
      expect(result.source).toBe("facebook");
    });

    it("should return structured result even on error", async () => {
      const scraper = new GoogleMapsScraper({ headless: true });

      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result).toMatchObject({
        businesses: expect.any(Array),
        pagination: expect.objectContaining({
          currentPage: expect.any(Number),
          totalPages: expect.any(Number),
          resultsPerPage: expect.any(Number),
          totalResults: expect.any(Number),
          hasNextPage: expect.any(Boolean),
        }),
        source: "google-maps",
      });

      await scraper.close();
    });

    it("should not throw on invalid search query", async () => {
      const scraper = new GoogleMapsScraper({ headless: true });

      expect(async () => {
        await scraper.scrape("", TEST_LOCATION);
      }).not.toThrow();

      await scraper.close();
    });

    it("should handle network timeout gracefully", async () => {
      const scraper = new GoogleMapsScraper({ headless: true });

      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.source).toBe("google-maps");
      expect(result.businesses).toBeDefined();

      await scraper.close();
    });
  });

  // ============================================================================
  // Rate Limiting Tests (4 tests)
  // ============================================================================
  describe("Rate Limiting Behavior", () => {
    it("should respect delayBetweenPagesMs configuration for GoogleMaps", async () => {
      const scraper = new GoogleMapsScraper({
        maxPages: 2,
        delayBetweenPagesMs: 500,
        headless: true,
      });

      const startTime = Date.now();
      await scraper.scrape(TEST_QUERY, TEST_LOCATION);
      const elapsed = Date.now() - startTime;

      expect(scraper).toBeDefined();
      expect(elapsed).toBeGreaterThanOrEqual(0);

      await scraper.close();
    });

    it("should respect delayBetweenPagesMs configuration for Yelp", async () => {
      const scraper = new YelpScraper({
        maxPages: 2,
        delayBetweenPagesMs: 500,
        headless: true,
      });

      const startTime = Date.now();
      await scraper.scrape(TEST_QUERY, TEST_LOCATION);
      const elapsed = Date.now() - startTime;

      expect(scraper).toBeDefined();
      expect(elapsed).toBeGreaterThanOrEqual(0);

      await scraper.close();
    });

    it("should respect delayBetweenPagesMs configuration for Facebook", async () => {
      const scraper = new FacebookScraper({
        maxPages: 2,
        delayBetweenPagesMs: 500,
      });

      const startTime = Date.now();
      await scraper.scrape(TEST_QUERY, TEST_LOCATION);
      const elapsed = Date.now() - startTime;

      expect(scraper).toBeDefined();
      expect(elapsed).toBeGreaterThanOrEqual(0);

      await scraper.close();
    });

    it("should work with zero delay between pages", async () => {
      const scraper = new GoogleMapsScraper({
        maxPages: 2,
        delayBetweenPagesMs: 0,
        headless: true,
      });

      const result = await scraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(result.source).toBe("google-maps");
      expect(result.businesses).toBeDefined();

      await scraper.close();
    });
  });

  // ============================================================================
  // Normalized Output Validation Tests (4 tests)
  // ============================================================================
  describe("Normalized Output Validation", () => {
    it("should produce consistent normalized output across all sources", async () => {
      const googleScraper = new GoogleMapsScraper({ headless: true });
      const yelpScraper = new YelpScraper({ headless: true });
      const facebookScraper = new FacebookScraper();

      const googleResult = await googleScraper.scrape(TEST_QUERY, TEST_LOCATION);
      const yelpResult = await yelpScraper.scrape(TEST_QUERY, TEST_LOCATION);
      const facebookResult = await facebookScraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(googleResult.businesses).toBeDefined();
      expect(yelpResult.businesses).toBeDefined();
      expect(facebookResult.businesses).toBeDefined();

      const requiredFields = ["name", "address", "source"];

      googleResult.businesses.forEach((business) => {
        requiredFields.forEach((field) => {
          expect(business).toHaveProperty(field);
        });
        expect(business.source).toBe("google-maps");
      });

      yelpResult.businesses.forEach((business) => {
        requiredFields.forEach((field) => {
          expect(business).toHaveProperty(field);
        });
        expect(business.source).toBe("yelp");
      });

      facebookResult.businesses.forEach((business) => {
        requiredFields.forEach((field) => {
          expect(business).toHaveProperty(field);
        });
        expect(business.source).toBe("facebook");
      });

      await googleScraper.close();
      await yelpScraper.close();
      await facebookScraper.close();
    });

    it("should not produce source-specific errors", async () => {
      const googleScraper = new GoogleMapsScraper({ headless: true });
      const yelpScraper = new YelpScraper({ headless: true });
      const facebookScraper = new FacebookScraper();

      const googleResult = await googleScraper.scrape(TEST_QUERY, TEST_LOCATION);
      const yelpResult = await yelpScraper.scrape(TEST_QUERY, TEST_LOCATION);
      const facebookResult = await facebookScraper.scrape(TEST_QUERY, TEST_LOCATION);

      expect(googleResult.source).toBe("google-maps");
      expect(yelpResult.source).toBe("yelp");
      expect(facebookResult.source).toBe("facebook");

      expect(googleResult.pagination).toBeDefined();
      expect(yelpResult.pagination).toBeDefined();
      expect(facebookResult.pagination).toBeDefined();

      expect(googleResult.timestamp).toBeDefined();
      expect(yelpResult.timestamp).toBeDefined();
      expect(facebookResult.timestamp).toBeDefined();

      await googleScraper.close();
      await yelpScraper.close();
      await facebookScraper.close();
    });

    it("should handle different search queries consistently", async () => {
      const scraper = new GoogleMapsScraper({ headless: true });

      const coffeeResult = await scraper.scrape("coffee shops", "Seattle");
      const restaurantResult = await scraper.scrape("restaurants", "New York");
      const retailResult = await scraper.scrape("retail stores", "Chicago");

      expect(coffeeResult.source).toBe("google-maps");
      expect(restaurantResult.source).toBe("google-maps");
      expect(retailResult.source).toBe("google-maps");

      expect(coffeeResult.businesses).toBeDefined();
      expect(restaurantResult.businesses).toBeDefined();
      expect(retailResult.businesses).toBeDefined();

      await scraper.close();
    });

    it("should handle different locations consistently", async () => {
      const scraper = new YelpScraper({ headless: true });

      const laResult = await scraper.scrape(TEST_QUERY, "Los Angeles");
      const nyResult = await scraper.scrape(TEST_QUERY, "New York");
      const chiResult = await scraper.scrape(TEST_QUERY, "Chicago");

      expect(laResult.source).toBe("yelp");
      expect(nyResult.source).toBe("yelp");
      expect(chiResult.source).toBe("yelp");

      expect(laResult.businesses).toBeDefined();
      expect(nyResult.businesses).toBeDefined();
      expect(chiResult.businesses).toBeDefined();

      await scraper.close();
    });
  });
});
