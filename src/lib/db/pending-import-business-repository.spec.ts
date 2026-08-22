/**
 * Pending Import Business Repository Tests
 *
 * Tests transaction rollback and error handling for import failures.
 */

import { getPool } from "./user-repository";
import {
  batchImportBusinesses,
  insertPendingBusiness,
  findPendingByStatus,
  countByStatus,
  importNormalizedBusinesses,
} from "./pending-import-business-repository";
import { ScraperSource } from "../../types/scraper-result";

/**
 * Build a mock DB client that mimics Postgres transaction semantics:
 * once a statement fails, every subsequent statement fails with
 * "current transaction is aborted" until ROLLBACK is issued.
 *
 * @param failOnInsert - throw this error for the given insert count (1-based)
 */
function abortedTransactionClient(failOnInsert: (insertCount: number) => Error | null) {
  let insertCount = 0;
  let aborted = false;

  return {
    query: jest.fn().mockImplementation((query: string) => {
      const q = query.trim().toUpperCase();

      if (aborted) {
        if (q === "ROLLBACK") {
          return Promise.resolve({ rows: [] });
        }
        throw new Error(
          "current transaction is aborted, commands ignored until end of transaction block"
        );
      }

      if (q.includes("INSERT")) {
        insertCount++;
        const error = failOnInsert(insertCount);
        if (error) {
          aborted = true;
          throw error;
        }
      }

      return Promise.resolve({ rows: [{ id: "test-id" }] });
    }),
  };
}

describe("Pending Import Business Repository", () => {
  beforeEach(async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
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

        const businessId = await insertPendingBusiness(client, {
          name: "Test Business",
          description: "A test business",
          category_id: "food-dining",
          source: ScraperSource.GOOGLE_MAPS,
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

        const businessId = await insertPendingBusiness(client, {
          name: "Test Business No Description",
          description: undefined,
          category_id: "retail-fashion",
          source: ScraperSource.YELP,
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

        const businesses = [
          {
            name: "Business 1",
            description: "First business",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "biz-1" },
            source: ScraperSource.GOOGLE_MAPS as ScraperSource,
            originalId: "biz-1",
          },
          {
            name: "Business 2",
            description: "Second business",
            category_id: "retail-fashion",
            source_data: { source: "yelp", originalId: "biz-2" },
            source: ScraperSource.YELP as ScraperSource,
            originalId: "biz-2",
          },
          {
            name: "Business 3",
            description: "Third business",
            category_id: "professional-services",
            source_data: { source: "facebook", originalId: "biz-3" },
            source: ScraperSource.FACEBOOK as ScraperSource,
            originalId: "biz-3",
          },
        ];

        const result = await batchImportBusinesses(client, businesses);

        expect(result.total).toBe(3);
        expect(result.succeeded).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.errors.length).toBe(0);

        // Verify all inserted (batchImportBusinesses commits its own transaction)
        const countResult = await client.query(
          `SELECT COUNT(*) FROM pending_import_businesses
           WHERE source_data->>'originalId' IN ('biz-1', 'biz-2', 'biz-3')`
        );
        expect(parseInt(countResult.rows[0].count, 10)).toBe(3);
      } finally {
        // Clean up the committed test rows so the shared test DB stays pristine
        await client.query(
          `DELETE FROM pending_import_businesses
           WHERE source_data->>'originalId' IN ('biz-1', 'biz-2', 'biz-3')`
        );
        client.release();
      }
    });

    it("should log errors with business details when insert fails", async () => {
      // Spy on console.error to verify logging
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Mock client that mimics Postgres: a failed statement aborts the
      // transaction; only ROLLBACK remains valid until it is issued.
      const failingClient = abortedTransactionClient((count) =>
        count === 1 ? new Error("Constraint violation: duplicate key") : null
      );

      const businesses = [
        {
          name: "Failing Business",
          description: "This will fail",
          category_id: "food-dining",
          source_data: { source: "google-maps", originalId: "fail-1" },
          source: ScraperSource.GOOGLE_MAPS as ScraperSource,
          originalId: "fail-1",
        },
      ];

      const result = await batchImportBusinesses(failingClient as any, businesses);

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].source).toBe(ScraperSource.GOOGLE_MAPS);
      expect(result.errors[0].originalId).toBe("fail-1");
      // In Postgres a failed statement aborts the whole transaction, so the
      // transaction-level error replaces the per-business one in the result.
      expect(result.errors[0].error).toContain("current transaction is aborted");

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

      const failingClient = abortedTransactionClient((count) =>
        count === 2 ? new Error("Simulated insert failure") : null
      );

      const businesses = [
        {
          name: "Business 1",
          description: "First",
          category_id: "food-dining",
          source_data: {},
          source: ScraperSource.GOOGLE_MAPS as ScraperSource,
          originalId: "1",
        },
        {
          name: "Business 2",
          description: "Second - will fail",
          category_id: "retail-fashion",
          source_data: {},
          source: ScraperSource.YELP as ScraperSource,
          originalId: "2",
        },
        {
          name: "Business 3",
          description: "Third",
          category_id: "professional-services",
          source_data: {},
          source: ScraperSource.FACEBOOK as ScraperSource,
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

        // Real rows may already exist in the shared dev database; assert
        // relative to the pre-insert baseline instead of an absolute count.
        const baseline = await countByStatus(client, "pending_review");

        await insertPendingBusiness(client, {
          name: "Pending Business 1",
          description: "Test 1",
          category_id: "food-dining",
          source: ScraperSource.GOOGLE_MAPS,
          source_data: {},
        });

        await insertPendingBusiness(client, {
          name: "Pending Business 2",
          description: "Test 2",
          category_id: "retail-fashion",
          source: ScraperSource.YELP,
          source_data: {},
        });

        const results = await findPendingByStatus(client, "pending_review");

        expect(results.length).toBe(baseline + 2);
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

        // Real rows may already exist in the shared dev database; assert
        // relative to the pre-insert baseline instead of an absolute count.
        const baseline = await countByStatus(client, "pending_review");

        await insertPendingBusiness(client, {
          name: "Count Test 1",
          description: "Test",
          category_id: "food-dining",
          source: ScraperSource.GOOGLE_MAPS,
          source_data: {},
        });

        await insertPendingBusiness(client, {
          name: "Count Test 2",
          description: "Test",
          category_id: "food-dining",
          source: ScraperSource.YELP,
          source_data: {},
        });

        const count = await countByStatus(client, "pending_review");
        expect(count).toBe(baseline + 2);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should return 0 when no matches", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");

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

        const businesses = [
          {
            name: "Normalized Business 1",
            description: "First normalized business",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "norm-1" },
            source: ScraperSource.GOOGLE_MAPS as ScraperSource,
            originalId: "norm-1",
          },
          {
            name: "Normalized Business 2",
            description: "Second normalized business",
            category_id: "retail-fashion",
            source_data: { source: "yelp", originalId: "norm-2" },
            source: ScraperSource.YELP as ScraperSource,
            originalId: "norm-2",
          },
        ];

        const result = await importNormalizedBusinesses(client, businesses);

        expect(result.total).toBe(2);
        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(0);

        // Verify all inserted (importNormalizedBusinesses commits its own transaction)
        const countResult = await client.query(
          `SELECT COUNT(*) FROM pending_import_businesses
           WHERE source_data->>'originalId' IN ('norm-1', 'norm-2')`
        );
        expect(parseInt(countResult.rows[0].count, 10)).toBe(2);
      } finally {
        // Clean up the committed test rows so the shared test DB stays pristine
        await client.query(
          `DELETE FROM pending_import_businesses
           WHERE source_data->>'originalId' IN ('norm-1', 'norm-2')`
        );
        client.release();
      }
    });

    it("should record import count when jobId is provided", async () => {
      const client = await getPool().connect();
      let jobId: string | null = null;
      try {

        // Create a scrape job to track the count
        const jobResult = await client.query(
          `INSERT INTO scrape_jobs (source, query, location, status, business_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id`,
          ["google-maps", "test query", "test location", "running", 0]
        );
        jobId = jobResult.rows[0].id;

        const businesses = [
          {
            name: "Count Test Business 1",
            description: "Test 1",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "count-1" },
            source: ScraperSource.GOOGLE_MAPS as ScraperSource,
            originalId: "count-1",
          },
          {
            name: "Count Test Business 2",
            description: "Test 2",
            category_id: "retail-fashion",
            source_data: { source: "yelp", originalId: "count-2" },
            source: ScraperSource.YELP as ScraperSource,
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
      } finally {
        // Clean up the committed test rows so the shared test DB stays pristine
        if (jobId) {
          await client.query("DELETE FROM scrape_jobs WHERE id = $1", [jobId]);
        }
        await client.query(
          `DELETE FROM pending_import_businesses
           WHERE source_data->>'originalId' IN ('count-1', 'count-2')`
        );
        client.release();
      }
    });

    it("should rollback all inserts when any insert fails", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const failingClient = abortedTransactionClient((count) =>
        count === 2 ? new Error("Simulated insert failure") : null
      );

      const businesses = [
        {
          name: "Norm Business 1",
          description: "First",
          category_id: "food-dining",
          source_data: {},
          source: ScraperSource.GOOGLE_MAPS as ScraperSource,
          originalId: "1",
        },
        {
          name: "Norm Business 2",
          description: "Second - will fail",
          category_id: "retail-fashion",
          source_data: {},
          source: ScraperSource.YELP as ScraperSource,
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

        // Use a job ID that will fail to update
        const invalidJobId = "00000000-0000-0000-0000-000000000000";

        const businesses = [
          {
            name: "Robust Import Business",
            description: "Should succeed even if count fails",
            category_id: "food-dining",
            source_data: { source: "google-maps", originalId: "robust-1" },
            source: ScraperSource.GOOGLE_MAPS as ScraperSource,
            originalId: "robust-1",
          },
        ];

        const result = await importNormalizedBusinesses(client, businesses, invalidJobId);

        // Import should succeed even though count recording fails
        expect(result.total).toBe(1);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);
      } finally {
        // Clean up the committed test row so the shared test DB stays pristine
        await client.query(
          `DELETE FROM pending_import_businesses
           WHERE source_data->>'originalId' = 'robust-1'`
        );
        client.release();
      }
    });
  });
});
