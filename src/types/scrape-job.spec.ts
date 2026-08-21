/**
 * Scrape Job Types Tests
 *
 * Tests for scrape job types and helper functions.
 *
 * NOTE: This spec was reconciled to the module's actual public API. The
 * previous version tested `createScrapeJob` / `updateScrapeJobStatus` factory
 * helpers and a capitalized 5-value status enum; none of those exist in
 * `./scrape-job`. The real module exposes the `ScrapeJobStatus` type
 * (5 lowercase values incl. cancelled), the `ScrapeJob` entity,
 * `validateScrapeJobInput`, and `isValidScrapeJobStatus`. Job creation/status
 * updates live in `@/lib/db/scrape-job-repository`, not here.
 */

import {
  isValidScrapeJobStatus,
  validateScrapeJobInput,
  type ScrapeJob,
  type ScrapeJobStatus,
} from "./scrape-job";

describe("Scrape Job Types", () => {
  describe("ScrapeJobStatus values", () => {
    it("should have the five required (lowercase) status values", () => {
      const validStatuses: ScrapeJobStatus[] = [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ];
      expect(validStatuses).toContain("pending");
      expect(validStatuses).toContain("running");
      expect(validStatuses).toContain("completed");
      expect(validStatuses).toContain("failed");
      expect(validStatuses).toContain("cancelled");
    });
  });

  describe("isValidScrapeJobStatus", () => {
    it("should return true for valid (lowercase) status values", () => {
      expect(isValidScrapeJobStatus("pending")).toBe(true);
      expect(isValidScrapeJobStatus("running")).toBe(true);
      expect(isValidScrapeJobStatus("completed")).toBe(true);
      expect(isValidScrapeJobStatus("failed")).toBe(true);
      expect(isValidScrapeJobStatus("cancelled")).toBe(true);
    });

    it("should return false for wrong-case values", () => {
      expect(isValidScrapeJobStatus("Pending")).toBe(false);
      expect(isValidScrapeJobStatus("Running")).toBe(false);
      expect(isValidScrapeJobStatus("Completed")).toBe(false);
      expect(isValidScrapeJobStatus("Failed")).toBe(false);
      expect(isValidScrapeJobStatus("Cancelled")).toBe(false);
    });

    it("should return false for statuses outside the union", () => {
      expect(isValidScrapeJobStatus("")).toBe(false);
      expect(isValidScrapeJobStatus("unknown")).toBe(false);
      expect(isValidScrapeJobStatus("InProgress")).toBe(false);
      expect(isValidScrapeJobStatus("success")).toBe(false);
      expect(isValidScrapeJobStatus("running ")).toBe(false);
    });
  });

  describe("validateScrapeJobInput", () => {
    it("should return valid when all required fields are present", () => {
      const result = validateScrapeJobInput({
        source: "google-maps",
        query: "black owned restaurants",
        location: "Dallas, TX",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject when source is missing or blank", () => {
      const missing = validateScrapeJobInput({
        source: "",
        query: "q",
        location: "l",
      });
      expect(missing.valid).toBe(false);
      expect(missing.errors).toContain("Source is required");

      const blank = validateScrapeJobInput({
        source: "   ",
        query: "q",
        location: "l",
      });
      expect(blank.valid).toBe(false);
      expect(blank.errors).toContain("Source is required");
    });

    it("should reject when query is missing", () => {
      const result = validateScrapeJobInput({
        source: "google",
        query: "",
        location: "l",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Query is required");
    });

    it("should reject when location is missing", () => {
      const result = validateScrapeJobInput({
        source: "google",
        query: "q",
        location: "",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Location is required");
    });

    it("should collect all missing-field errors", () => {
      const result = validateScrapeJobInput({ source: "", query: "", location: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "Source is required",
          "Query is required",
          "Location is required",
        ])
      );
    });
  });

  describe("ScrapeJob entity shape", () => {
    it("should carry the entity fields with camelCase keys", () => {
      const job: ScrapeJob = {
        id: "job-123",
        source: "google-maps",
        query: "black owned restaurants",
        location: "Dallas, TX",
        status: "pending",
        businessCount: 0,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      };

      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("source");
      expect(job).toHaveProperty("query");
      expect(job).toHaveProperty("location");
      expect(job).toHaveProperty("status");
      expect(job).toHaveProperty("createdAt");
      expect(job).toHaveProperty("updatedAt");
      expect(typeof job.id).toBe("string");
      expect(typeof job.source).toBe("string");
      expect(job.status).toBe("pending");
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.updatedAt).toBeInstanceOf(Date);
    });
  });
});
