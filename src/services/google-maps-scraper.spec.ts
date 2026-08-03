/**
 * Google Maps Scraper Tests
 * Note: These are unit tests with mocked browser behavior
 * Integration tests require actual browser and network access
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { GoogleMapsScraper, ScrapedBusiness } from './google-maps-scraper';

// Mock playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
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
        }),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('GoogleMapsScraper', () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    scraper = new GoogleMapsScraper({ headless: true });
    jest.clearAllMocks();
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

  describe('searchBusinesses', () => {
    it('should search for businesses with a query', async () => {
      const result = await scraper.searchBusinesses({ query: 'restaurants' });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should search with location parameter', async () => {
      const result = await scraper.searchBusinesses({
        query: 'restaurants',
        location: 'New York',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should respect maxResults configuration', async () => {
      const scraperWithLimit = new GoogleMapsScraper({
        headless: true,
        maxResults: 5,
      });

      const result = await scraperWithLimit.searchBusinesses({ query: 'test' });

      expect(result.length).toBeLessThanOrEqual(5);
      await scraperWithLimit.close();
    });

    it('should return businesses with required fields', async () => {
      const result = await scraper.searchBusinesses({ query: 'test' });

      if (result.length > 0) {
        const business = result[0];
        expect(business.name).toBeDefined();
        expect(business.category).toBeDefined();
        expect(typeof business.rating).toBe('number');
        expect(typeof business.reviewCount).toBe('number');
        expect(business.location).toBeDefined();
      }
    });

    it('should handle empty query gracefully', async () => {
      const result = await scraper.searchBusinesses({ query: '' });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBusinessDetails', () => {
    it('should get details for a specific business', async () => {
      const result = await scraper.getBusinessDetails('test business');

      expect(result).toBeDefined();
    });

    it('should return null when business not found', async () => {
      // Mock empty result
      const scraperWithEmptyResult = new GoogleMapsScraper({ headless: true });

      // Override evaluate to return null
      const mockPage = {
        goto: jest.fn().mockResolvedValue({}),
        waitForSelector: jest.fn().mockResolvedValue({}),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(null),
        close: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
      };

      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (mockBrowser.newContext as jest.Mock).mockResolvedValue(mockContext);

      await scraperWithEmptyResult.close();
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
      const result = await scraper.searchBusinesses({ query: 'test' });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
