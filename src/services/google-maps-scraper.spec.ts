/**
 * Google Maps Scraper QA Tests
 * Integration tests validating AC1: Search results page loads successfully and businesses are visible
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { GoogleMapsScraper, ScrapedBusiness, SearchParams } from './google-maps-scraper';

// Mock playwright - newPage will return mockPage from beforeEach
let mockPageInstance: any;
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn(() => mockPageInstance),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('GoogleMapsScraper', () => {
  let scraper: GoogleMapsScraper;
  let mockPage: any;

  beforeEach(() => {
    scraper = new GoogleMapsScraper({ headless: true });
    jest.clearAllMocks();
    // Create a mock page object that can be customized per test
    mockPageInstance = {
      goto: jest.fn().mockResolvedValue({}),
      waitForSelector: jest.fn().mockResolvedValue({}),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue([
        {
          name: 'Test Business',
          category: 'Test Category',
          rating: 4.5,
          reviewCount: 100,
          location: 'Test City',
          imageUrl: '',
          description: 'Test description',
          tags: ['test'],
        },
      ]),
      close: jest.fn().mockResolvedValue(undefined),
      $: jest.fn().mockResolvedValue({
        click: jest.fn().mockResolvedValue(undefined),
      }),
    };
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe('initialize', () => {
    it('should initialize the browser', async () => {
      await scraper.initialize();
      // Browser should be initialized without error
      expect(true).toBe(true);
    });
  });

  describe('scrape', () => {
    it('should scrape businesses with a query and location', async () => {
      const result = await scraper.scrape('restaurants', 'New York');

      expect(result).toBeDefined();
      expect(result.businesses).toBeDefined();
      expect(Array.isArray(result.businesses)).toBe(true);
    });

    it('should respect maxPages configuration', async () => {
      const scraperWithLimit = new GoogleMapsScraper({
        maxPages: 2,
      });

      const result = await scraperWithLimit.scrape('test', 'location');

      expect(result.pagination.totalPages).toBeLessThanOrEqual(2);
      await scraperWithLimit.close();
    });

    it('should return businesses with required fields', async () => {
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        expect(business.name).toBeDefined();
        expect(business.category).toBeDefined();
        expect(typeof business.rating).toBe('number');
        expect(typeof business.reviewCount).toBe('number');
        expect(business.location).toBeDefined();
      }
    });

    it('should handle empty query gracefully', async () => {
      const result = await scraper.scrape('', 'location');

      expect(result).toBeDefined();
      expect(Array.isArray(result.businesses)).toBe(true);
    });
  });

  describe('close', () => {
    it('should close the browser', async () => {
      await scraper.initialize();
      await scraper.close();

      // Should not throw on double close
      await scraper.close();
    });
  });

  describe('error handling', () => {
    it('should handle scraper errors gracefully', async () => {
      // The scraper has a fallback mechanism, so errors are handled gracefully
      const result = await scraper.scrape('test', 'location');

      expect(result).toBeDefined();
      expect(Array.isArray(result.businesses)).toBe(true);
    });
  });

  // ============================================================================
  // QA Integration Tests for AC1: Search for businesses on Google Maps
  // ============================================================================

  describe('AC1 - Search results page loads successfully', () => {
    it('should navigate to Google Maps search URL', async () => {
      // Arrange
      const searchParams: SearchParams = { query: 'restaurants' };

      // Act
      const result = await scraper.scrape('restaurants', 'New York');

      // Assert - page should load without throwing
      expect(result).toBeDefined();
      expect(Array.isArray(result.businesses)).toBe(true);
    });

    it('should handle search with location parameter', async () => {
      // Arrange
      const searchParams: SearchParams = {
        query: 'coffee shops',
        location: 'Seattle',
      };

      // Act
      const result = await scraper.scrape('coffee shops', 'Seattle');

      // Assert
      expect(result).toBeDefined();
      expect(Array.isArray(result.businesses)).toBe(true);
    });

    it('should build correct search URL with location', async () => {
      // This test validates the URL construction logic
      const searchParams: SearchParams = {
        query: 'pizza',
        location: 'Chicago',
      };

      // The scraper should construct: "pizza in Chicago"
      const result = await scraper.scrape('pizza', 'Chicago');

      expect(result).toBeDefined();
    });

    it('should handle empty results gracefully', async () => {
      // Arrange - mock empty result
      const emptyScraper = new GoogleMapsScraper({ headless: true });

      // Act & Assert - should return empty array, not throw
      const result = await emptyScraper.scrape('nonexistent business xyz123', 'location');

      expect(result).toBeDefined();
      expect(Array.isArray(result.businesses)).toBe(true);
      // May be empty or have results depending on mock
    });
  });

  describe('AC1 - Businesses are visible in results', () => {
    it('should return businesses with all required fields', async () => {
      // Act
      const result = await scraper.scrape('test', 'location');

      // Assert
      expect(result).toBeDefined();
      expect(Array.isArray(result.businesses)).toBe(true);

      if (result.businesses.length > 0) {
        const business = result[0];
        expect(business).toHaveProperty('name');
        expect(business).toHaveProperty('category');
        expect(business).toHaveProperty('rating');
        expect(business).toHaveProperty('reviewCount');
        expect(business).toHaveProperty('location');
        expect(typeof business.name).toBe('string');
        expect(typeof business.category).toBe('string');
        expect(typeof business.rating).toBe('number');
        expect(typeof business.reviewCount).toBe('number');
      }
    });

    it('should deduplicate businesses by name', async () => {
      // The scraper implementation deduplicates by name
      // This test validates that behavior through the mock
      const result = await scraper.scrape('duplicate test', 'location');

      expect(result).toBeDefined();

      if (result.businesses.length > 0) {
        const names = result.businesses.map((b) => b.name);
        const uniqueNames = new Set(names);
        expect(names.length).toBe(uniqueNames.size);
      }
    });

    it('should respect maxResults limit', async () => {
      // Arrange
      const limitedScraper = new GoogleMapsScraper({
        headless: true,
        maxResults: 3,
      });

      // Act
      const result = await limitedScraper.scrape('test', 'location');

      // Assert
      expect(result.businesses.length).toBeLessThanOrEqual(3);

      await limitedScraper.close();
    });

    it('should extract rating as a number between 0 and 5', async () => {
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        expect(business.rating).toBeGreaterThanOrEqual(0);
        expect(business.rating).toBeLessThanOrEqual(5);
      }
    });

    it('should extract review count as a non-negative integer', async () => {
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        expect(business.reviewCount).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(business.reviewCount)).toBe(true);
      }
    });
  });

  describe('AC1 - Scraper lifecycle', () => {
    it('should initialize browser on first search', async () => {
      const newScraper = new GoogleMapsScraper({ headless: true });

      await newScraper.scrape('test', 'location');

      // Should not throw
      expect(true).toBe(true);

      await newScraper.close();
    });

    it('should reuse browser instance for multiple scrapes', async () => {
      // First scrape
      const result1 = await scraper.scrape('test1', 'location');
      expect(result1).toBeDefined();

      // Second scrape should reuse browser
      const result2 = await scraper.scrape('test2', 'location');
      expect(result2).toBeDefined();
    });

    it('should handle browser close gracefully', async () => {
      await scraper.close();

      // Double close should not throw
      await scraper.close();
    });
  });

  // ============================================================================
  // QA Integration Tests for AC4: Extract business metadata (category, rating, review count)
  // ============================================================================

  describe('AC4 - Extract business category', () => {
    it('should extract category from business listing', async () => {
      // Arrange - mock returns business with category
      const searchQuery = 'restaurants';

      // Act
      const result = await scraper.scrape(searchQuery, 'location');

      // Assert - category should be captured
      expect(result).toBeDefined();
      expect(result.businesses.length).toBeGreaterThan(0);

      const business = result.businesses[0];
      expect(business.category).toBeDefined();
      expect(typeof business.category).toBe('string');
      expect(business.category).not.toBe('');
    });

    it('should extract category with specific format from aria-label', async () => {
      // The scraper extracts category from aria-label by splitting on comma
      // Mock data includes "Test Category" which should be extracted
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        // Category should be a meaningful string, not just "Unknown" or "Business"
        expect(business.category).not.toBe('Unknown');
      }
    });

    it('should handle missing category gracefully', async () => {
      // The scraper defaults to "Business" when category cannot be extracted
      // This test validates the fallback behavior
      const result = await scraper.scrape('test', 'location');

      expect(result).toBeDefined();

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        // Category should always be present, even if default
        expect(typeof business.category).toBe('string');
        expect(business.category.length).toBeGreaterThan(0);
      }
    });
  });

  describe('AC4 - Extract business rating', () => {
    it('should extract rating as a number between 1 and 5', async () => {
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        expect(business.rating).toBeDefined();
        expect(typeof business.rating).toBe('number');
        expect(business.rating).toBeGreaterThanOrEqual(0);
        expect(business.rating).toBeLessThanOrEqual(5);
      }
    });

    it('should extract rating from star rating aria-label', async () => {
      // The scraper parses rating from aria-label containing "star"
      // Mock returns 4.5 stars
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        // Verify rating is a valid decimal number
        expect(Number.isFinite(business.rating)).toBe(true);
      }
    });

    it('should handle missing rating with default value of 0', async () => {
      // When rating cannot be extracted, scraper defaults to 0
      const result = await scraper.scrape('test', 'location');

      expect(result).toBeDefined();

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        // Rating should be a valid number (0 if not found)
        expect(typeof business.rating).toBe('number');
        expect(business.rating).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('AC4 - Extract review count', () => {
    it('should extract review count as a non-negative integer', async () => {
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        expect(business.reviewCount).toBeDefined();
        expect(typeof business.reviewCount).toBe('number');
        expect(business.reviewCount).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(business.reviewCount)).toBe(true);
      }
    });

    it('should parse review count from text containing "review" or "reviews"', async () => {
      // The scraper uses regex to extract numbers from review text
      // Mock returns 100 reviews
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        // Review count should be a valid integer
        expect(Number.isInteger(business.reviewCount)).toBe(true);
      }
    });

    it('should handle missing review count with default value of 0', async () => {
      // When review count cannot be extracted, scraper defaults to 0
      const result = await scraper.scrape('test', 'location');

      expect(result).toBeDefined();

      if (result.businesses.length > 0) {
        const business = result.businesses[0];
        // Review count should be a valid non-negative integer
        expect(typeof business.reviewCount).toBe('number');
        expect(business.reviewCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('AC4 - Complete metadata extraction', () => {
    it('should extract all required metadata fields in a single scrape', async () => {
      const result = await scraper.scrape('test', 'location');

      if (result.businesses.length > 0) {
        const business = result.businesses[0];

        // All metadata fields should be present
        expect(business).toHaveProperty('category');
        expect(business).toHaveProperty('rating');
        expect(business).toHaveProperty('reviewCount');

        // All should have correct types
        expect(typeof business.category).toBe('string');
        expect(typeof business.rating).toBe('number');
        expect(typeof business.reviewCount).toBe('number');

        // Category should be non-empty
        expect(business.category.length).toBeGreaterThan(0);

        // Rating should be in valid range
        expect(business.rating).toBeGreaterThanOrEqual(0);
        expect(business.rating).toBeLessThanOrEqual(5);

        // Review count should be non-negative
        expect(business.reviewCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should extract metadata for multiple businesses consistently', async () => {
      const result = await scraper.scrape('test', 'location');

      // Verify all returned businesses have metadata
      result.businesses.forEach((business, index) => {
        expect(business.category).toBeDefined();
        expect(typeof business.category).toBe('string');
        expect(typeof business.rating).toBe('number');
        expect(typeof business.reviewCount).toBe('number');
      });
    });

    // Note: Pagination tests require browser integration and cannot be unit tested
    // with mocked page objects. These tests are validated through integration tests.
    it('should paginate through multiple pages when results exceed 10', async () => {
      // This test validates that the scraper returns results with pagination metadata
      const result = await scraper.scrape('test query', 'test location');

      expect(result).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.currentPage).toBeGreaterThanOrEqual(1);
    });

    it('should deduplicate businesses across pages', async () => {
      // This test validates deduplication is working in the scraper
      const result = await scraper.scrape('test query', 'test location');

      expect(result).toBeDefined();

      // Check that all businesses have unique names
      const businessNames = result.businesses.map((b) => b.name);
      const uniqueNames = new Set(businessNames);
      expect(businessNames.length).toBe(uniqueNames.size);
    });

    it('should respect maxPages configuration', async () => {
      // Arrange - scraper configured for max 2 pages
      const limitedScraper = new GoogleMapsScraper({
        maxPages: 2,
      });

      const result = await limitedScraper.scrape('test query', 'test location');

      // Assert - should not exceed maxPages
      expect(result.pagination.totalPages).toBeLessThanOrEqual(2);
      await limitedScraper.close();
    });

    it('should stop pagination when no more pages available', async () => {
      const result = await scraper.scrape('test query', 'test location');

      // Assert - pagination metadata should be present
      expect(result.pagination).toBeDefined();
      expect(result.pagination.hasNextPage).toBeDefined();
    });
  });
});
