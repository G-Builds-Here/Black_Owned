/**
 * Pending Import Business Repository Tests
 *
 * Tests transaction rollback and error handling for import failures.
 */

import { getPool } from "./user-repository";
import {
  batchImportBusinesses,
  insertPendingBusiness,
  initializePendingImportSchema,
  findPendingByStatus,
  countByStatus,
  importNormalizedBusinesses,
} from "./pending-import-business-repository";
import { ScraperSource } from "../../types/scraper-result";

describe("Pending Import Business Repository", () => {
  beforeEach(async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await initializePendingImportSchema(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  describe("insertPendingBusiness", () => {
    it("should insert a single pending business successfully", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const businessId = await insertPendingBusiness(client, {
          name: "Test Business",
          description: "A test business",
          category_id: "food-dining",
          source_data: { source: "google-maps", originalId: "test-123" },
        });

        expect(businessId).toBeDefined();
        expect(typeof businessId).toBe("string");

        const result = await client.query(
          "SELECT * FROM pending_import_businesses WHERE id = $1",
          [businessId]
        );

        expect(result.rows[0].name).toBe("Test Business");
        expect(result.rows[0].description).toBe("A test business");
        expect(result.rows[0].category_id).toBe("food-dining");
        expect(result.rows[0].status).toBe("pending_review");

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should insert business with undefined description", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const businessId = await insertPendingBusiness(client, {
          name: "Test Business No Description",
          description: undefined,
          category_id: "retail-fashion",
          source_data: { source: "yelp", originalId: "test-456" },
        });

        const result = await client.query(
          "SELECT * FROM pending_import_businesses WHERE id = $1",
          [businessId]
        );

        expect(result.rows[0].description).toBeNull();

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  describe("batchImportBusinesses - transaction rollback", () => {
    it("should insert all businesses when batch succeeds", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const businesses = [
          {
            name: "Business 1",
            description: "First business",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "biz-1" },
            source: ScraperSource.GoogleMaps as ScraperSource,
            originalId: "biz-1",
          },
          {
            name: "Business 2",
            description: "Second business",
            category_id: "retail-fashion",
            source_data: { source: "yelp", originalId: "biz-2" },
            source: ScraperSource.Yelp as ScraperSource,
            originalId: "biz-2",
          },
          {
            name: "Business 3",
            description: "Third business",
            category_id: "professional-services",
            source_data: { source: "facebook", originalId: "biz-3" },
            source: ScraperSource.Facebook as ScraperSource,
            originalId: "biz-3",
          },
        ];

        const result = await batchImportBusinesses(client, businesses);

        expect(result.total).toBe(3);
        expect(result.succeeded).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.errors.length).toBe(0);

        // Verify all inserted
        const countResult = await client.query(
          "SELECT COUNT(*) FROM pending_import_businesses"
        );
        expect(parseInt(countResult.rows[0].count, 10)).toBe(3);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should log errors with business details when insert fails", async () => {
      // Spy on console.error to verify logging
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Create a mock client that will fail on insert
      const failingClient = {
        query: jest.fn().mockImplementation((query: string) => {
          if (query.includes("INSERT")) {
            throw new Error("Constraint violation: duplicate key");
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const businesses = [
        {
          name: "Failing Business",
          description: "This will fail",
          category_id: "food-dining",
          source_data: { source: "google-maps", originalId: "fail-1" },
          source: ScraperSource.GoogleMaps as ScraperSource,
          originalId: "fail-1",
        },
      ];

      const result = await batchImportBusinesses(failingClient as any, businesses);

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].source).toBe(ScraperSource.GoogleMaps);
      expect(result.errors[0].originalId).toBe("fail-1");
      expect(result.errors[0].error).toContain("Constraint violation");

      // Verify error was logged with business details
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failing Business")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("google-maps")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("fail-1")
      );

      consoleSpy.mockRestore();
    });

    it("should rollback all inserts when any single insert fails", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      let insertCount = 0;
      const failingClient = {
        query: jest.fn().mockImplementation((query: string) => {
          if (query.includes("INSERT")) {
            insertCount++;
            if (insertCount === 2) {
              throw new Error("Simulated insert failure");
            }
          }
          return Promise.resolve({ rows: [{ id: "test-id" }] });
        }),
      };

      const businesses = [
        {
          name: "Business 1",
          description: "First",
          category_id: "food-dining",
          source_data: {},
          source: ScraperSource.GoogleMaps as ScraperSource,
          originalId: "1",
        },
        {
          name: "Business 2",
          description: "Second - will fail",
          category_id: "retail-fashion",
          source_data: {},
          source: ScraperSource.Yelp as ScraperSource,
          originalId: "2",
        },
        {
          name: "Business 3",
          description: "Third",
          category_id: "professional-services",
          source_data: {},
          source: ScraperSource.Facebook as ScraperSource,
          originalId: "3",
        },
      ];

      const result = await batchImportBusinesses(failingClient as any, businesses);

      // All should be marked as failed due to rollback
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(3);

      // All errors should be recorded
      expect(result.errors.length).toBe(3);

      consoleSpy.mockRestore();
    });

    it("should handle empty batch gracefully", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const result = await batchImportBusinesses(client, []);

        expect(result.total).toBe(0);
        expect(result.succeeded).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.errors.length).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  describe("findPendingByStatus", () => {
    it("should find businesses by status", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        await insertPendingBusiness(client, {
          name: "Pending Business 1",
          description: "Test 1",
          category_id: "food-dining",
          source_data: {},
        });

        await insertPendingBusiness(client, {
          name: "Pending Business 2",
          description: "Test 2",
          category_id: "retail-fashion",
          source_data: {},
        });

        const results = await findPendingByStatus(client, "pending_review");

        expect(results.length).toBe(2);
        expect(results[0].status).toBe("pending_review");
        expect(results[1].status).toBe("pending_review");

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should return empty array when no matches", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const results = await findPendingByStatus(client, "approved");
        expect(results.length).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  describe("countByStatus", () => {
    it("should count businesses by status", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        await insertPendingBusiness(client, {
          name: "Count Test 1",
          description: "Test",
          category_id: "food-dining",
          source_data: {},
        });

        await insertPendingBusiness(client, {
          name: "Count Test 2",
          description: "Test",
          category_id: "food-dining",
          source_data: {},
        });

        const count = await countByStatus(client, "pending_review");
        expect(count).toBe(2);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should return 0 when no matches", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const count = await countByStatus(client, "approved");
        expect(count).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  describe("importNormalizedBusinesses - single transaction with count recording", () => {
    it("should insert all normalized businesses in a single transaction", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const businesses = [
          {
            name: "Normalized Business 1",
            description: "First normalized business",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "norm-1" },
            source: ScraperSource.GoogleMaps as ScraperSource,
            originalId: "norm-1",
          },
          {
            name: "Normalized Business 2",
            description: "Second normalized business",
            category_id: "retail-fashion",
            source_data: { source: "yelp", originalId: "norm-2" },
            source: ScraperSource.Yelp as ScraperSource,
            originalId: "norm-2",
          },
        ];

        const result = await importNormalizedBusinesses(client, businesses);

        expect(result.total).toBe(2);
        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(0);

        // Verify all inserted
        const countResult = await client.query(
          "SELECT COUNT(*) FROM pending_import_businesses"
        );
        expect(parseInt(countResult.rows[0].count, 10)).toBe(2);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should record import count when jobId is provided", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        // Create a scrape job to track the count
        await client.query(
          `INSERT INTO scrape_jobs (source, query, location, status, business_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id`,
          ["google-maps", "test query", "test location", "importing", 0]
        );

        const jobsResult = await client.query("SELECT id FROM scrape_jobs WHERE status = $1", [
          "importing",
        ]);
        const jobId = jobsResult.rows[0].id;

        const businesses = [
          {
            name: "Count Test Business 1",
            description: "Test 1",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "count-1" },
            source: ScraperSource.GoogleMaps as ScraperSource,
            originalId: "count-1",
          },
          {
            name: "Count Test Business 2",
            description: "Test 2",
            category_id: "retail-fashion",
            source_data: { source: "yelp", originalId: "count-2" },
            source: ScraperSource.Yelp as ScraperSource,
            originalId: "count-2",
          },
        ];

        const result = await importNormalizedBusinesses(client, businesses, jobId);

        expect(result.total).toBe(2);
        expect(result.succeeded).toBe(2);

        // Verify count was recorded
        const updatedJob = await client.query(
          "SELECT business_count FROM scrape_jobs WHERE id = $1",
          [jobId]
        );
        expect(parseInt(updatedJob.rows[0].business_count, 10)).toBe(2);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should rollback all inserts when any insert fails", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      let insertCount = 0;
      const failingClient = {
        query: jest.fn().mockImplementation((query: string) => {
          if (query.includes("INSERT")) {
            insertCount++;
            if (insertCount === 2) {
              throw new Error("Simulated insert failure");
            }
          }
          return Promise.resolve({ rows: [{ id: "test-id" }] });
        }),
      };

      const businesses = [
        {
          name: "Norm Business 1",
          description: "First",
          category_id: "food-dining",
          source_data: {},
          source: ScraperSource.GoogleMaps as ScraperSource,
          originalId: "1",
        },
        {
          name: "Norm Business 2",
          description: "Second - will fail",
          category_id: "retail-fashion",
          source_data: {},
          source: ScraperSource.Yelp as ScraperSource,
          originalId: "2",
        },
      ];

      const result = await importNormalizedBusinesses(failingClient as any, businesses);

      // All should be marked as failed due to rollback
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors.length).toBe(2);

      consoleSpy.mockRestore();
    });

    it("should handle empty batch gracefully", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        const result = await importNormalizedBusinesses(client, []);

        expect(result.total).toBe(0);
        expect(result.succeeded).toBe(0);
        expect(result.failed).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should not fail import when count recording fails", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await initializePendingImportSchema(client);

        // Create a scrape job that will fail to update (invalid ID)
        const invalidJobId = "00000000-0000-0000-0000-000000000000";

        const businesses = [
          {
            name: "Robust Import Business",
            description: "Should succeed even if count fails",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "robust-1" },
            source: ScraperSource.GoogleMaps as ScraperSource,
            originalId: "robust-1",
          },
        ];

        const result = await importNormalizedBusinesses(client, businesses, invalidJobId);

        // Import should succeed even though count recording fails
        expect(result.total).toBe(1);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });
});
