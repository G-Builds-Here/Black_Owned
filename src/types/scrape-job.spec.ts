/**
 * Scrape Job Type Tests
 */

import {
  validateScrapeJobInput,
  createDefaultScrapeJob,
  CreateScrapeJobInput,
  ScraperSource,
} from "./scrape-job";

describe("Scrape Job Types", () => {
  describe("validateScrapeJobInput", () => {
    it("should validate a correct input", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "black owned restaurants",
        location: "Atlanta, GA",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid source", () => {
      const input: CreateScrapeJobInput = {
        source: "invalid-source" as ScraperSource,
        query: "SELECT * FROM table",
        location: "us-east-1",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid source");
    });

    it("should reject empty query", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "",
        location: "us-east-1",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: query");
    });

    it("should reject empty location", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "SELECT * FROM table",
        location: "",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: location");
    });

    it("should reject whitespace-only fields", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "   ",
        location: "us-east-1",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: query");
    });
  });

  describe("createDefaultScrapeJob", () => {
    it("should create a job with pending status", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "black owned restaurants",
        location: "Atlanta, GA",
      };

      const job = createDefaultScrapeJob(input);

      expect(job.source).toBe("google-maps");
      expect(job.query).toBe("black owned restaurants");
      expect(job.location).toBe("Atlanta, GA");
      expect(job.status).toBe("pending");
      expect(job.id).toBeDefined();
      expect(job.created_at).toBeInstanceOf(Date);
      expect(job.updated_at).toBeInstanceOf(Date);
    });

    it("should generate a valid UUID", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "SELECT * FROM table",
        location: "us-east-1",
      };

      const job = createDefaultScrapeJob(input);

      // UUID v4 format: 8-4-4-4-12 hex characters
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(job.id)).toBe(true);
    });

    it("should have matching created_at and updated_at", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "SELECT * FROM table",
        location: "us-east-1",
      };

      const job = createDefaultScrapeJob(input);

      expect(job.created_at.getTime()).toBe(job.updated_at.getTime());
    });

    it("should initialize business_count to 0", () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "SELECT * FROM table",
        location: "us-east-1",
      };

      const job = createDefaultScrapeJob(input);

      expect(job.business_count).toBe(0);
    });
  });
});
