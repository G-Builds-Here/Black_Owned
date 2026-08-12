/**
 * Business Seeder Tests
 *
 * Tests for foreign key constraint compliance in business seeding.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { Pool, PoolClient } from "pg";
import {
  seedBusinesses,
  countTestBusinesses,
  generateSampleBusinesses,
  SeedResult,
} from "./business-seeder";
import { TEST_PREFIX } from "./test-data-seeder";

// Mock pool and client
const mockQuery = jest.fn();
const mockClient = {
  query: mockQuery,
  release: jest.fn(),
} as unknown as PoolClient;

describe("Business Seeder - Foreign Key Constraints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateSampleBusinesses", () => {
    it("generates exactly 20 businesses", () => {
      const businesses = generateSampleBusinesses();
      expect(businesses).toHaveLength(20);
    });

    it("all businesses have BWS-TEST prefix", () => {
      const businesses = generateSampleBusinesses();
      for (const business of businesses) {
        expect(business.name).toContain(TEST_PREFIX);
      }
    });

    it("covers multiple categories", () => {
      const businesses = generateSampleBusinesses();
      const categories = new Set(businesses.map((b) => b.categoryId));
      expect(categories.size).toBeGreaterThan(3);
    });

    it("all businesses have required fields", () => {
      const businesses = generateSampleBusinesses();
      for (const business of businesses) {
        expect(business.id).toBeDefined();
        expect(business.name).toBeDefined();
        expect(business.description).toBeDefined();
        expect(business.categoryId).toBeDefined();
      }
    });
  });

  describe("seedBusinesses - Foreign Key Compliance", () => {
    it("calls createBusiness with valid ownerId for each new business", async () => {
      const testOwnerId = "test-owner-uuid-12345";

      // Mock: all businesses don't exist (return empty rows for each check)
      mockQuery.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM")) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes("INSERT INTO")) {
          return Promise.resolve({
            rows: [{ id: "new-business-id", owner_id: testOwnerId }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await seedBusinesses(mockClient, testOwnerId, false);

      // Verify create was called for all 20 businesses
      const insertCalls = mockQuery.mock.calls.filter((call) =>
        call[0]?.includes("INSERT")
      );
      expect(insertCalls.length).toBe(20);

      // Verify each insert includes the ownerId
      for (const call of insertCalls) {
        expect(call[1]).toContain(testOwnerId);
      }
    });

    it("skips existing businesses without creating duplicates", async () => {
      const testOwnerId = "test-owner-uuid-12345";

      // Mock: all businesses exist
      mockQuery.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM")) {
          return Promise.resolve({ rows: [{ id: "existing-id" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await seedBusinesses(mockClient, testOwnerId, false);

      expect(result.skipped).toBe(20);
      expect(result.created).toBe(0);

      // Should not call INSERT for existing businesses
      const insertCalls = mockQuery.mock.calls.filter((call) =>
        call[0]?.includes("INSERT")
      );
      expect(insertCalls.length).toBe(0);
    });

    it("resets existing data when reset flag is true", async () => {
      const testOwnerId = "test-owner-uuid-12345";

      // Mock: delete on reset
      mockQuery.mockImplementation((query: string) => {
        if (query.includes("DELETE")) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes("SELECT id FROM")) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes("INSERT INTO")) {
          return Promise.resolve({
            rows: [{ id: "new-business-id", owner_id: testOwnerId }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await seedBusinesses(mockClient, testOwnerId, true);

      // Verify DELETE was called
      const deleteCall = mockQuery.mock.calls.find(
        (call) => call[0]?.includes("DELETE")
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall?.[0]).toContain(TEST_PREFIX);

      // Verify businesses were created after reset
      expect(result.created).toBe(20);
    });

    it("returns correct seed summary when all exist", async () => {
      const testOwnerId = "test-owner-uuid-12345";

      // Mock all businesses exist
      mockQuery.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM")) {
          return Promise.resolve({ rows: [{ id: "existing-id" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await seedBusinesses(mockClient, testOwnerId, false);

      expect(result).toEqual({
        created: 0,
        skipped: 20,
        total: 20,
      });
    });

    it("returns correct seed summary when all are new", async () => {
      const testOwnerId = "test-owner-uuid-12345";

      // Mock all businesses are new
      mockQuery.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM")) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes("INSERT INTO")) {
          return Promise.resolve({
            rows: [{ id: "new-business-id", owner_id: testOwnerId }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await seedBusinesses(mockClient, testOwnerId, false);

      expect(result).toEqual({
        created: 20,
        skipped: 0,
        total: 20,
      });
    });
  });

  describe("countTestBusinesses", () => {
    it("returns count of test businesses", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "15" }] });

      const count = await countTestBusinesses(mockClient);

      expect(count).toBe(15);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain("SELECT COUNT");
      expect(call[0]).toContain(TEST_PREFIX);
    });
  });
});
