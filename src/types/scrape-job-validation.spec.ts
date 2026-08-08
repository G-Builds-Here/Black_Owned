/**
 * Scrape Job Validation Tests
 *
 * Tests for validateScrapeJobInput function.
 */

import { validateScrapeJobInput } from "./scrape-job";

describe("validateScrapeJobInput", () => {
  describe("valid input", () => {
    it("should validate google-maps source correctly", () => {
      const input = {
        source: "google-maps" as const,
        query: "black owned restaurants",
        location: "Dallas, TX",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should validate yelp source correctly", () => {
      const input = {
        source: "yelp" as const,
        query: "black owned salons",
        location: "Atlanta, GA",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should validate facebook source correctly", () => {
      const input = {
        source: "facebook" as const,
        query: "black owned businesses",
        location: "Washington, DC",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("missing required fields", () => {
    it("should fail when source is missing", () => {
      const input = {
        source: "" as unknown as "google-maps" | "yelp" | "facebook",
        query: "black owned restaurants",
        location: "Dallas, TX",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: source");
    });

    it("should fail when query is missing", () => {
      const input = {
        source: "google-maps" as const,
        query: "",
        location: "Dallas, TX",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: query");
    });

    it("should fail when location is missing", () => {
      const input = {
        source: "google-maps" as const,
        query: "black owned restaurants",
        location: "",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: location");
    });

    it("should fail when all fields are missing", () => {
      const input = {
        source: "" as unknown as "google-maps" | "yelp" | "facebook",
        query: "",
        location: "",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain("Missing required field: source");
      expect(result.errors).toContain("Missing required field: query");
      expect(result.errors).toContain("Missing required field: location");
    });
  });

  describe("invalid source values", () => {
    it("should fail for invalid source 'twitter'", () => {
      const input = {
        source: "twitter" as unknown as "google-maps" | "yelp" | "facebook",
        query: "black owned businesses",
        location: "Dallas, TX",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid source: must be 'google-maps', 'yelp', or 'facebook'"
      );
    });

    it("should fail for invalid source 'instagram'", () => {
      const input = {
        source: "instagram" as unknown as "google-maps" | "yelp" | "facebook",
        query: "black owned businesses",
        location: "Dallas, TX",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid source: must be 'google-maps', 'yelp', or 'facebook'"
      );
    });

    it("should fail for invalid source 'linkedin'", () => {
      const input = {
        source: "linkedin" as unknown as "google-maps" | "yelp" | "facebook",
        query: "black owned businesses",
        location: "Dallas, TX",
      };

      const result = validateScrapeJobInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid source: must be 'google-maps', 'yelp', or 'facebook'"
      );
    });
  });
});
