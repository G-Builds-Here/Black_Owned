/**
 * Tests for seed-scrape-jobs.ts
 *
 * Verifies that the seed script creates 5 test scrape jobs:
 * - 2 Google Maps jobs
 * - 2 Yelp jobs
 * - 1 Facebook job
 * Each with realistic search queries and locations.
 */

import { TEST_JOBS } from "./seed-scrape-jobs";
import { CreateScrapeJobInput } from "../src/types/scrape-job";

describe("Seed Scrape Jobs", () => {
  describe("TEST_JOBS configuration", () => {
    it("should define exactly 5 test jobs", () => {
      expect(TEST_JOBS).toHaveLength(5);
    });

    it("should have 2 Google Maps jobs", () => {
      const googleMapsJobs = TEST_JOBS.filter((job) => job.source === "google-maps");
      expect(googleMapsJobs).toHaveLength(2);
    });

    it("should have 2 Yelp jobs", () => {
      const yelpJobs = TEST_JOBS.filter((job) => job.source === "yelp");
      expect(yelpJobs).toHaveLength(2);
    });

    it("should have 1 Facebook job", () => {
      const facebookJobs = TEST_JOBS.filter((job) => job.source === "facebook");
      expect(facebookJobs).toHaveLength(1);
    });

    it("should have realistic search queries for each job", () => {
      // All jobs should have non-empty, realistic queries
      TEST_JOBS.forEach((job) => {
        expect(job.query).toBeTruthy();
        expect(job.query.trim()).not.toBe("");
        // Queries should be relevant to Black Owned directory
        expect(job.query.toLowerCase()).toContain("black owned");
      });
    });

    it("should have realistic locations for each job", () => {
      // All jobs should have non-empty locations
      TEST_JOBS.forEach((job) => {
        expect(job.location).toBeTruthy();
        expect(job.location.trim()).not.toBe("");
      });
    });

    it("should have unique job combinations", () => {
      // Each job should have a unique source + query + location combination
      const combinations = TEST_JOBS.map(
        (job) => `${job.source}:${job.query}:${job.location}`
      );
      const uniqueCombinations = new Set(combinations);
      expect(uniqueCombinations.size).toBe(TEST_JOBS.length);
    });
  });

  describe("Google Maps jobs", () => {
    it("should have varied queries", () => {
      const googleMapsJobs = TEST_JOBS.filter((job) => job.source === "google-maps");
      const queries = googleMapsJobs.map((job) => job.query);
      const uniqueQueries = new Set(queries);
      expect(uniqueQueries.size).toBe(2); // Both queries should be different
    });

    it("should have different locations", () => {
      const googleMapsJobs = TEST_JOBS.filter((job) => job.source === "google-maps");
      const locations = googleMapsJobs.map((job) => job.location);
      const uniqueLocations = new Set(locations);
      expect(uniqueLocations.size).toBe(2); // Both locations should be different
    });
  });

  describe("Yelp jobs", () => {
    it("should have varied queries", () => {
      const yelpJobs = TEST_JOBS.filter((job) => job.source === "yelp");
      const queries = yelpJobs.map((job) => job.query);
      const uniqueQueries = new Set(queries);
      expect(uniqueQueries.size).toBe(2); // Both queries should be different
    });

    it("should have different locations", () => {
      const yelpJobs = TEST_JOBS.filter((job) => job.source === "yelp");
      const locations = yelpJobs.map((job) => job.location);
      const uniqueLocations = new Set(locations);
      expect(uniqueLocations.size).toBe(2); // Both locations should be different
    });
  });

  describe("Job input validation", () => {
    it("should have valid source values", () => {
      const validSources = ["google-maps", "yelp", "facebook"];
      TEST_JOBS.forEach((job) => {
        expect(validSources).toContain(job.source);
      });
    });

    it("should conform to CreateScrapeJobInput interface", () => {
      TEST_JOBS.forEach((job: CreateScrapeJobInput) => {
        expect(job).toHaveProperty("source");
        expect(job).toHaveProperty("query");
        expect(job).toHaveProperty("location");
      });
    });
  });
});
