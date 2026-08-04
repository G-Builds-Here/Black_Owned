/**
 * Scrape Job Types Tests
 *
 * Tests for scrape job types and helper functions.
 */

import {
  createScrapeJob,
  updateScrapeJobStatus,
  isValidScrapeJobStatus,
  type ScrapeJob,
  type ScrapeJobStatus,
} from "./scrape-job";

describe("Scrape Job Types", () => {
  describe("ScrapeJobStatus enum", () => {
    it("should have all required status values", () => {
      const validStatuses: ScrapeJobStatus[] = ["Pending", "Running", "Completed", "Failed", "Cancelled"];
      expect(validStatuses).toContain("Pending");
      expect(validStatuses).toContain("Running");
      expect(validStatuses).toContain("Completed");
      expect(validStatuses).toContain("Failed");
      expect(validStatuses).toContain("Cancelled");
    });
  });

  describe("createScrapeJob", () => {
    it("should create a scrape job with correct fields", () => {
      const job = createScrapeJob("job-123", "google", "black owned restaurants", "Dallas, TX");

      expect(job.id).toBe("job-123");
      expect(job.source).toBe("google");
      expect(job.query).toBe("black owned restaurants");
      expect(job.location).toBe("Dallas, TX");
      expect(job.status).toBe("Pending");
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.updatedAt).toBeInstanceOf(Date);
    });

    it("should set createdAt and updatedAt to the same value initially", () => {
      const job = createScrapeJob("job-456", "bing", "black owned shops", "Houston, TX");
      expect(job.createdAt.getTime()).toBe(job.updatedAt.getTime());
    });

    it("should create job with Pending status by default", () => {
      const job = createScrapeJob("job-789", "yahoo", "black owned cafes", "Austin, TX");
      expect(job.status).toBe("Pending");
    });
  });

  describe("updateScrapeJobStatus", () => {
    it("should update status and updated timestamp", () => {
      const originalJob = createScrapeJob("job-123", "google", "test query", "Dallas, TX");
      const originalUpdatedAt = originalJob.updatedAt;

      const updatedJob = updateScrapeJobStatus(originalJob, "Running");

      expect(updatedJob.status).toBe("Running");
      expect(updatedJob.updatedAt).toBeInstanceOf(Date);
      expect(updatedJob.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
      expect(updatedJob.id).toBe(originalJob.id);
      expect(updatedJob.source).toBe(originalJob.source);
      expect(updatedJob.query).toBe(originalJob.query);
      expect(updatedJob.location).toBe(originalJob.location);
      expect(updatedJob.createdAt).toBe(originalJob.createdAt);
    });

    it("should allow transitioning through all statuses", () => {
      let job = createScrapeJob("job-123", "google", "test", "Dallas, TX");

      job = updateScrapeJobStatus(job, "Running");
      expect(job.status).toBe("Running");

      job = updateScrapeJobStatus(job, "Completed");
      expect(job.status).toBe("Completed");

      job = updateScrapeJobStatus(job, "Failed");
      expect(job.status).toBe("Failed");

      job = updateScrapeJobStatus(job, "Cancelled");
      expect(job.status).toBe("Cancelled");
    });
  });

  describe("isValidScrapeJobStatus", () => {
    it("should return true for valid status values", () => {
      expect(isValidScrapeJobStatus("Pending")).toBe(true);
      expect(isValidScrapeJobStatus("Running")).toBe(true);
      expect(isValidScrapeJobStatus("Completed")).toBe(true);
      expect(isValidScrapeJobStatus("Failed")).toBe(true);
      expect(isValidScrapeJobStatus("Cancelled")).toBe(true);
    });

    it("should return false for invalid status values", () => {
      expect(isValidScrapeJobStatus("pending")).toBe(false);
      expect(isValidScrapeJobStatus("running")).toBe(false);
      expect(isValidScrapeJobStatus("completed")).toBe(false);
      expect(isValidScrapeJobStatus("failed")).toBe(false);
      expect(isValidScrapeJobStatus("cancelled")).toBe(false);
      expect(isValidScrapeJobStatus("")).toBe(false);
      expect(isValidScrapeJobStatus("unknown")).toBe(false);
      expect(isValidScrapeJobStatus("InProgress")).toBe(false);
    });
  });

  describe("ScrapeJob interface fields", () => {
    it("should have all required fields", () => {
      const job = createScrapeJob("job-123", "google", "test query", "Dallas, TX");

      // Verify all required fields exist
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("source");
      expect(job).toHaveProperty("query");
      expect(job).toHaveProperty("location");
      expect(job).toHaveProperty("status");
      expect(job).toHaveProperty("createdAt");
      expect(job).toHaveProperty("updatedAt");

      // Verify field types
      expect(typeof job.id).toBe("string");
      expect(typeof job.source).toBe("string");
      expect(typeof job.query).toBe("string");
      expect(typeof job.location).toBe("string");
      expect(typeof job.status).toBe("string");
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.updatedAt).toBeInstanceOf(Date);
    });
  });
});
