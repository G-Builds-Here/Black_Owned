/**
 * ScraperResult Type Tests
 *
 * Tests for the unified ScraperResult struct that holds raw scraped data
 * before normalization.
 */

import {
  ScraperResult,
  RawScrapedBusiness,
  ScraperPagination,
} from "./scraper-result";

describe("ScraperResult", () => {
  describe("RawScrapedBusiness", () => {
    it("should create a minimal business with required fields only", () => {
      const business: RawScrapedBusiness = {
        name: "Test Business",
      };

      expect(business.name).toBe("Test Business");
      expect(business.address).toBeUndefined();
      expect(business.phone).toBeUndefined();
    });

    it("should create a business with all Google Maps fields", () => {
      const business: RawScrapedBusiness = {
        name: "Google Maps Business",
        address: "123 Main St, New York, NY",
        phone: "+1-555-1234",
        website: "https://example.com",
        rating: 4.5,
        reviewCount: 156,
        sourceId: "gmaps_12345",
        imageUrl: "https://example.com/image.jpg",
        description: "A great business",
        tags: ["tag1", "tag2"],
      };

      expect(business.name).toBe("Google Maps Business");
      expect(business.rating).toBe(4.5);
      expect(business.tags).toEqual(["tag1", "tag2"]);
    });

    it("should create a business with Yelp-specific fields", () => {
      const business: RawScrapedBusiness = {
        name: "Yelp Business",
        address: "456 Oak Ave, Los Angeles, CA",
        category: "Italian Restaurant",
        rating: 4.0,
        reviewCount: 89,
        sourceId: "yelp_67890",
        priceRange: "$$",
      };

      expect(business.category).toBe("Italian Restaurant");
      expect(business.priceRange).toBe("$$");
    });

    it("should create a business with Facebook-specific fields", () => {
      const business: RawScrapedBusiness = {
        name: "Facebook Business Page",
        category: "Community Organization",
        sourceId: "fb_page_11111",
        hours: "Mon-Fri 9am-5pm",
      };

      expect(business.category).toBe("Community Organization");
      expect(business.hours).toBe("Mon-Fri 9am-5pm");
    });
  });

  describe("ScraperPagination", () => {
    it("should create pagination for single page results", () => {
      const pagination: ScraperPagination = {
        currentPage: 1,
        totalPages: 1,
        resultsPerPage: 10,
        totalResults: 5,
        hasNextPage: false,
      };

      expect(pagination.currentPage).toBe(1);
      expect(pagination.hasNextPage).toBe(false);
    });

    it("should create pagination for multi-page results", () => {
      const pagination: ScraperPagination = {
        currentPage: 3,
        totalPages: 5,
        resultsPerPage: 10,
        totalResults: 47,
        hasNextPage: true,
      };

      expect(pagination.currentPage).toBe(3);
      expect(pagination.hasNextPage).toBe(true);
    });
  });

  describe("ScraperResult", () => {
    it("should create a Google Maps scraper result", () => {
      const result: ScraperResult = {
        businesses: [
          {
            name: "Business 1",
            address: "123 Main St",
            rating: 4.5,
            sourceId: "gmaps_001",
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 1,
          hasNextPage: false,
        },
        source: "google-maps",
        query: "restaurants",
        location: "New York, NY",
        timestamp: new Date("2026-08-03T10:00:00Z"),
      };

      expect(result.source).toBe("google-maps");
      expect(result.query).toBe("restaurants");
      expect(result.businesses.length).toBe(1);
      expect(result.timestamp.toISOString()).toBe("2026-08-03T10:00:00.000Z");
    });

    it("should create a Yelp scraper result", () => {
      const result: ScraperResult = {
        businesses: [
          {
            name: "Yelp Business",
            category: "Italian",
            rating: 4.0,
            sourceId: "yelp_001",
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 2,
          resultsPerPage: 10,
          totalResults: 15,
          hasNextPage: true,
        },
        source: "yelp",
        query: "pizza",
        location: "Chicago, IL",
        timestamp: new Date(),
      };

      expect(result.source).toBe("yelp");
      expect(result.businesses[0].category).toBe("Italian");
    });

    it("should create a Facebook scraper result", () => {
      const result: ScraperResult = {
        businesses: [
          {
            name: "Facebook Page",
            category: "Non-Profit",
            sourceId: "fb_001",
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 1,
          hasNextPage: false,
        },
        source: "facebook",
        query: "community",
        location: "Atlanta, GA",
        timestamp: new Date(),
      };

      expect(result.source).toBe("facebook");
    });

    it("should include optional rawResponse field", () => {
      const result: ScraperResult = {
        businesses: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 0,
          hasNextPage: false,
        },
        source: "google-maps",
        query: "test",
        location: "Test City",
        timestamp: new Date(),
        rawResponse: "<html>raw html here</html>",
      };

      expect(result.rawResponse).toBe("<html>raw html here</html>");
    });

    it("should include optional scrapeMetadata field", () => {
      const result: ScraperResult = {
        businesses: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 0,
          hasNextPage: false,
        },
        source: "google-maps",
        query: "test",
        location: "Test City",
        timestamp: new Date(),
        scrapeMetadata: {
          durationMs: 5432,
          userAgent: "Mozilla/5.0...",
          proxyUsed: "proxy.example.com:8080",
        },
      };

      expect(result.scrapeMetadata?.durationMs).toBe(5432);
      expect(result.scrapeMetadata?.proxyUsed).toBe("proxy.example.com:8080");
    });

    it("should handle empty results", () => {
      const result: ScraperResult = {
        businesses: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          resultsPerPage: 10,
          totalResults: 0,
          hasNextPage: false,
        },
        source: "google-maps",
        query: "nonexistent",
        location: "Nowhere",
        timestamp: new Date(),
      };

      expect(result.businesses.length).toBe(0);
      expect(result.pagination.totalResults).toBe(0);
    });
  });

  describe("Type safety", () => {
    it("should allow source-specific fields to be optional", () => {
      // Google Maps business with imageUrl and tags
      const googleBusiness: RawScrapedBusiness = {
        name: "Google Business",
        imageUrl: "https://example.com/img.jpg",
        tags: ["tag1"],
      };

      // Yelp business with category and priceRange
      const yelpBusiness: RawScrapedBusiness = {
        name: "Yelp Business",
        category: "Restaurant",
        priceRange: "$$$",
      };

      // Facebook business with category and hours
      const facebookBusiness: RawScrapedBusiness = {
        name: "Facebook Page",
        category: "Community",
        hours: "9am-5pm",
      };

      expect(googleBusiness.imageUrl).toBe("https://example.com/img.jpg");
      expect(yelpBusiness.priceRange).toBe("$$$");
      expect(facebookBusiness.hours).toBe("9am-5pm");
    });
  });
});
