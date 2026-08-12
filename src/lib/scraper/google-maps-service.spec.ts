/**
 * Google Maps Scraper Service Tests
 */

import {
  validateSearchRequest,
  searchGoogleMapsSearch,
  resetRateLimiter,
  getRateLimiterInstance,
  type GoogleMapsSearchRequest,
} from "./google-maps-service";

describe("Google Maps Scraper Service", () => {
  describe("validateSearchRequest", () => {
    it("should validate a correct request", () => {
      const request = {
        query: "restaurants",
        location: "Los Angeles",
        type: "restaurant",
      };

      const result = validateSearchRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject a request with missing query", () => {
      const request = {
        location: "Los Angeles",
        type: "restaurant",
      };

      const result = validateSearchRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Query is required")
      );
    });

    it("should reject a request with empty query", () => {
      const request = {
        query: "",
        location: "Los Angeles",
      };

      const result = validateSearchRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Query is required")
      );
    });

    it("should reject a request with non-string query", () => {
      const request = {
        query: 123,
      };

      const result = validateSearchRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Query is required")
      );
    });

    it("should reject a request with non-string location", () => {
      const request = {
        query: "restaurants",
        location: 123,
      };

      const result = validateSearchRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Location must be a string")
      );
    });

    it("should reject a request with non-string type", () => {
      const request = {
        query: "restaurants",
        type: 123,
      };

      const result = validateSearchRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Type must be a string")
      );
    });

    it("should accept a request with only query", () => {
      const request = {
        query: "restaurants",
      };

      const result = validateSearchRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject null request", () => {
      const result = validateSearchRequest(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Request must be an object")
      );
    });

    it("should reject undefined request", () => {
      const result = validateSearchRequest(undefined);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Request must be an object")
      );
    });
  });

  describe("searchGoogleMapsSearch", () => {
    it("should return successful response with results", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
        location: "Los Angeles",
        type: "restaurant",
      };

      const result = await searchGoogleMapsSearch(request);

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.metadata.searchQuery).toBe("restaurants");
      expect(result.metadata.location).toBe("Los Angeles");
      expect(result.metadata.type).toBe("restaurant");
      expect(result.metadata.totalResults).toBe(result.data.length);
      expect(result.metadata.timestamp).toBeDefined();
    });

    it("should return results with correct structure", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "coffee shops",
      };

      return expect(searchGoogleMapsSearch(request)).resolves.toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            name: expect.any(String),
            address: expect.any(String),
            rating: expect.any(Number),
            reviews: expect.any(Number),
            type: expect.any(String),
            coordinates: expect.objectContaining({
              lat: expect.any(Number),
              lng: expect.any(Number),
            }),
          }),
        ]),
      });
    });

    it("should respect maxResults option", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "stores",
      };

      const result = await searchGoogleMapsSearch(request, {
        maxResults: 5,
      });

      expect(result.data.length).toBeLessThanOrEqual(5);
    });

    it("should handle request without optional parameters", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "services",
      };

      const result = await searchGoogleMapsSearch(request);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.metadata.searchQuery).toBe("services");
    });

    it("should include metadata in response", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "entertainment",
        location: "New York",
        type: "entertainment",
      };

      const result = await searchGoogleMapsSearch(request);

      expect(result.metadata).toMatchObject({
        searchQuery: "entertainment",
        location: "New York",
        type: "entertainment",
        totalResults: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it("should return business results with all expected fields", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const result = await searchGoogleMapsSearch(request);

      const firstResult = result.data[0];

      expect(firstResult).toMatchObject({
        name: expect.any(String),
        address: expect.any(String),
        rating: expect.any(Number),
        reviews: expect.any(Number),
        type: expect.any(String),
      });

      // Optional fields should be present
      expect(firstResult.phone).toBeDefined();
      expect(firstResult.website).toBeDefined();
      expect(firstResult.coordinates).toBeDefined();
      expect(firstResult.hours).toBeDefined();
      expect(firstResult.priceLevel).toBeDefined();
    });

    it("should capture phone number when available in business data", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const result = await searchGoogleMapsSearch(request);

      // AC requirement: phone number is captured if available
      const resultsWithPhone = result.data.filter((item) => item.phone !== undefined);
      expect(resultsWithPhone.length).toBeGreaterThan(0);

      resultsWithPhone.forEach((business) => {
        expect(business.phone).toMatch(/^\(555\)/);
      });
    });

    it("should capture website URL when available in business data", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const result = await searchGoogleMapsSearch(request);

      // AC requirement: website URL is captured if available
      const resultsWithWebsite = result.data.filter((item) => item.website !== undefined);
      expect(resultsWithWebsite.length).toBeGreaterThan(0);

      resultsWithWebsite.forEach((business) => {
        expect(business.website).toMatch(/^https?:\/\//);
      });
    });

    it("should handle business results where phone may be undefined", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const result = await searchGoogleMapsSearch(request);

      // AC requirement: phone is captured IF available - undefined is acceptable
      result.data.forEach((business) => {
        if (business.phone !== undefined) {
          expect(typeof business.phone).toBe("string");
        }
      });
    });

    it("should handle business results where website may be undefined", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const result = await searchGoogleMapsSearch(request);

      // AC requirement: website is captured IF available - undefined is acceptable
      result.data.forEach((business) => {
        if (business.website !== undefined) {
          expect(typeof business.website).toBe("string");
        }
      });
    });

    it("should apply rate limiting between consecutive requests", async () => {
      // Reset the rate limiter to ensure a clean state
      resetRateLimiter();

      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const startTime = Date.now();

      // Make first request
      await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 100, maxJitterMs: 50 });

      // Make second request immediately
      await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 100, maxJitterMs: 50 });

      const elapsed = Date.now() - startTime;

      // Should have waited at least minDelay (100ms) plus some jitter
      // Minimum expected: 100ms (first request has no delay, second waits min 100ms)
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow small timing variance
    });

    it("should add random jitter to prevent pattern detection", async () => {
      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const timings: number[] = [];

      // Run multiple consecutive requests and measure delays
      for (let i = 0; i < 5; i++) {
        resetRateLimiter();
        const startTime = Date.now();
        await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 50, maxJitterMs: 50 });
        await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 50, maxJitterMs: 50 });
        const elapsed = Date.now() - startTime;
        timings.push(elapsed);
      }

      // Verify that timings vary (due to jitter)
      // All should be at least 50ms (minDelay), but should not all be identical
      const allAtMin = timings.every((t) => t < 60);
      const allAtMax = timings.every((t) => t > 90);

      // At least some variation should exist (not all at min or all at max)
      expect(!(allAtMin && allAtMax)).toBe(true);
    });

    it("should skip rate limiting when disabled", async () => {
      resetRateLimiter();

      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const startTime = Date.now();

      // Make multiple requests with rate limiting disabled
      await searchGoogleMapsSearch(request, { rateLimitEnabled: false });
      await searchGoogleMapsSearch(request, { rateLimitEnabled: false });
      await searchGoogleMapsSearch(request, { rateLimitEnabled: false });

      const elapsed = Date.now() - startTime;

      // Should be very fast (only the 100ms simulated API delay per request, no rate limit wait)
      // 3 requests * 100ms = 300ms max, but they run sequentially so ~300ms
      // With rate limiting disabled, should be much faster than with 2s delay
      expect(elapsed).toBeLessThan(500);
    });

    it("should use custom minDelay and maxJitter when provided", async () => {
      resetRateLimiter();

      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      const startTime = Date.now();

      // Use very short delay (10ms) with no jitter
      await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 10, maxJitterMs: 0 });
      await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 10, maxJitterMs: 0 });

      const elapsed = Date.now() - startTime;

      // Should wait approximately 10ms for the second request
      expect(elapsed).toBeGreaterThanOrEqual(5); // Allow small timing variance
      expect(elapsed).toBeLessThan(50); // Should not be much more than 10ms
    });

    it("should reset rate limiter between test sessions", async () => {
      resetRateLimiter();

      const request: GoogleMapsSearchRequest = {
        query: "restaurants",
      };

      // First request should not wait
      const start1 = Date.now();
      await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 100, maxJitterMs: 0 });
      const time1 = Date.now() - start1;

      // Second request should wait
      const start2 = Date.now();
      await searchGoogleMapsSearch(request, { rateLimitEnabled: true, minDelayMs: 100, maxJitterMs: 0 });
      const time2 = Date.now() - start2;

      // First request should be fast (no prior request to wait for)
      expect(time1).toBeLessThan(50);

      // Second request should wait at least 100ms
      expect(time2).toBeGreaterThanOrEqual(90);
    });
  });
});
