/**
 * Business Importer Tests
 *
 * QA tests for the business import pipeline.
 */

import { PoolClient } from "pg";
import {
  importBusinessBatch,
  initializeImportSchema,
  ImportResult,
  BatchImportResult,
} from "./business-importer";
import { ScraperResult, ScraperSource, GoogleMapsRawData, YelpRawData, FacebookRawData } from "../../types/scraper-result";

// Mock PoolClient
const mockClient = {
  query: jest.fn(),
} as unknown as PoolClient;

describe("Business Importer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initializeImportSchema", () => {
    it("should initialize the business schema", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await initializeImportSchema(mockClient);

      expect(mockClient.query).toHaveBeenCalled();
    });
  });

  describe("importBusinessBatch", () => {
    it("should import a single business successfully", async () => {
      const mockScrapedData: ScraperResult = {
        source: ScraperSource.GOOGLE_MAPS,
        rawData: {
          placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
          name: "Test Business",
          formattedAddress: "123 Main St, Sydney NSW, Australia",
          latitude: -33.8688,
          longitude: 151.2093,
          types: ["restaurant", "food"],
        } as GoogleMapsRawData,
        scrapedAt: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check if exists
        .mockResolvedValueOnce({
          rows: [
            {
              id: "test-id-123",
              owner_id: "owner-123",
              name: "Test Business",
              description: null,
              category_id: "food-dining",
              verification_status: "unverified",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        });

      const result = await importBusinessBatch(mockClient, [mockScrapedData], "owner-123");

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].businessId).toBe("test-id-123");
    });

    it("should handle duplicate business gracefully", async () => {
      const mockScrapedData: ScraperResult = {
        source: ScraperSource.YELP,
        rawData: {
          id: "yelp-business-123",
          alias: "test-business",
          name: "Yelp Business",
          image_url: "https://example.com/image.jpg",
          is_claimed: true,
          is_closed: false,
          url: "https://example.com",
          phone: "+1234567890",
          display_phone: "(123) 456-7890",
          review_count: 10,
          categories: [{ alias: "restaurant", title: "Restaurant" }],
          rating: 4.5,
          location: {
            address1: "123 Main St",
            city: "San Francisco",
            state: "CA",
            zip_code: "94105",
            country: "US",
            display_address: ["123 Main St", "San Francisco, CA 94105"],
          },
          coordinates: { latitude: 37.7749, longitude: -122.4194 },
          photos: ["https://example.com/photo.jpg"],
          price: "$$",
        } as YelpRawData,
        scrapedAt: new Date(),
      };

      // Simulate existing business
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: "yelp-business-123" }],
      });

      const result = await importBusinessBatch(mockClient, [mockScrapedData], "owner-123");

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("already exists");
    });

    it("should handle batch import with mixed results", async () => {
      const mockData1: ScraperResult = {
        source: ScraperSource.GOOGLE_MAPS,
        rawData: {
          placeId: "place-1",
          name: "Business 1",
          formattedAddress: "Address 1",
          latitude: 1.0,
          longitude: 1.0,
          types: ["restaurant"],
        } as GoogleMapsRawData,
        scrapedAt: new Date(),
      };

      const mockData2: ScraperResult = {
        source: ScraperSource.FACEBOOK,
        rawData: {
          id: "fb-123",
          name: "Facebook Business",
          description: "A Facebook business page",
          category: "Retail Store",
        } as FacebookRawData,
        scrapedAt: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check exists for business 1
        .mockResolvedValueOnce({
          rows: [{ id: "new-id-1", owner_id: "owner-123", name: "Business 1", description: null, category_id: "food-dining", verification_status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Check exists for business 2
        .mockResolvedValueOnce({
          rows: [{ id: "new-id-2", owner_id: "owner-123", name: "Facebook Business", description: "A Facebook business page", category_id: "retail-fashion", verification_status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
        });

      const result = await importBusinessBatch(mockClient, [mockData1, mockData2], "owner-123");

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should handle import errors gracefully", async () => {
      const mockScrapedData: ScraperResult = {
        source: ScraperSource.GOOGLE_MAPS,
        rawData: {
          placeId: "place-error",
          name: "Error Business",
          formattedAddress: "Error Address",
          latitude: 1.0,
          longitude: 1.0,
          types: [],
        } as GoogleMapsRawData,
        scrapedAt: new Date(),
      };

      mockClient.query.mockRejectedValueOnce(new Error("Database connection failed"));

      const result = await importBusinessBatch(mockClient, [mockScrapedData], "owner-123");

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe("Database connection failed");
    });

    it("should handle empty batch", async () => {
      const result = await importBusinessBatch(mockClient, [], "owner-123");

      expect(result.total).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should process large batches in chunks", async () => {
      const largeBatch: ScraperResult[] = [];
      for (let i = 0; i < 100; i++) {
        largeBatch.push({
          source: ScraperSource.GOOGLE_MAPS,
          rawData: {
            placeId: `place-${i}`,
            name: `Business ${i}`,
            formattedAddress: `Address ${i}`,
            latitude: i,
            longitude: i,
            types: ["restaurant"],
          } as GoogleMapsRawData,
          scrapedAt: new Date(),
        });
      }

      // Mock successful import for all - each business needs 2 queries (check + insert)
      let queryCount = 0;
      mockClient.query.mockImplementation(() => {
        queryCount++;
        // Odd calls are existence checks (return empty), even calls are inserts (return mock business)
        if (queryCount % 2 === 1) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({
          rows: [{ id: `mock-id-${queryCount}`, owner_id: "owner-123", name: "Mock", description: null, category_id: "food-dining", verification_status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
        });
      });

      const result = await importBusinessBatch(mockClient, largeBatch, "owner-123", 50);

      expect(result.total).toBe(100);
      expect(result.succeeded).toBe(100);
      expect(result.failed).toBe(0);
    });
  });

  describe("Category normalization", () => {
    it("should map Google Maps types to categories", async () => {
      const mockData: ScraperResult = {
        source: ScraperSource.GOOGLE_MAPS,
        rawData: {
          placeId: "place-1",
          name: "Test Restaurant",
          formattedAddress: "123 St",
          latitude: 1.0,
          longitude: 1.0,
          types: ["restaurant", "food", "meal_delivery"],
        } as GoogleMapsRawData,
        scrapedAt: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "new-id", owner_id: "owner-123", name: "Test Restaurant", description: null, category_id: "food-dining", verification_status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
        });

      const result = await importBusinessBatch(mockClient, [mockData], "owner-123");

      expect(result.results[0].success).toBe(true);
    });

    it("should map Facebook categories to internal categories", async () => {
      const mockData: ScraperResult = {
        source: ScraperSource.FACEBOOK,
        rawData: {
          id: "fb-test",
          name: "Health Store",
          category: "Health & Wellness Center",
          description: "A wellness center",
        } as FacebookRawData,
        scrapedAt: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "new-id", owner_id: "owner-123", name: "Health Store", description: "A wellness center", category_id: "health-wellness", verification_status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
        });

      const result = await importBusinessBatch(mockClient, [mockData], "owner-123");

      expect(result.results[0].success).toBe(true);
    });
  });
});
