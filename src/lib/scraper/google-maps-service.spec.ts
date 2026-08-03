/**
 * Google Maps Scraper Service Tests
 */

import {
  validateSearchRequest,
  searchGoogleMapsSearch,
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
  });
});
