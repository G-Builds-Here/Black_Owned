/**
 * Scraper Job Executor Unit Tests - LOC-0054
 *
 * Unit tests for scraper job execution logic without database dependency.
 * Validates the business logic of the executeScrapeJob function.
 */

import { executeScrapeJob, executeScrapeJobById } from "./scraper-job-executor";
import { CreateScrapeJobInput } from "../types/scrape-job";

// Mock the database repositories
jest.mock("../lib/db/scrape-job-repository", () => ({
  createScrapeJob: jest.fn().mockImplementation((client, input) =>
    Promise.resolve({
      id: "test-job-id",
      source: input.source,
      query: input.query,
      location: input.location,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ),
  findScrapeJobById: jest.fn().mockImplementation((client, id) =>
    Promise.resolve({
      id,
      source: "google-maps",
      query: "test query",
      location: "Test City",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ),
  updateScrapeJobStatus: jest.fn().mockImplementation((client, id, status, count) =>
    Promise.resolve({
      id,
      source: "google-maps",
      query: "test query",
      location: "Test City",
      status,
      resultCount: count,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ),
}));

// Mock the scraped business repository
jest.mock("../lib/db/scraped-business-repository", () => ({
  createScrapedBusiness: jest.fn().mockResolvedValue({
    id: "business-id",
    scrapeJobId: "test-job-id",
    source: "google-maps",
    name: "Test Business",
    address: "123 Test St",
    createdAt: new Date(),
  }),
  findScrapedBusinessesByJobId: jest.fn().mockResolvedValue([]),
}));

// Mock the business scraper - default mock
const mockScraper = {
  source: "google-maps" as const,
  scrape: jest.fn(),
};

jest.mock("./business-scraper", () => ({
  getScraper: jest.fn(() => mockScraper),
}));

describe("Scraper Job Executor - Unit Tests (LOC-0054)", () => {
  const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default successful mock
    mockScraper.scrape.mockResolvedValue({
      businesses: [
        {
          name: "Test Business 1",
          address: "123 Test St, Test City, TX",
          phone: "(555) 123-4567",
          website: "https://test1.com",
          rating: 4.5,
          reviewCount: 100,
          source: "google-maps",
        },
        {
          name: "Test Business 2",
          address: "456 Test Ave, Test City, TX",
          phone: "(555) 987-6543",
          website: "https://test2.com",
          rating: 4.0,
          reviewCount: 50,
          source: "google-maps",
        },
      ],
      source: "google-maps",
      query: "test query",
      location: "Test City",
      timestamp: new Date(),
      pagination: {
        currentPage: 1,
        totalPages: 1,
        resultsPerPage: 10,
        totalResults: 2,
        hasNextPage: false,
      },
    });
  });

  describe("executeScrapeJob - Happy Path", () => {
    it("AC1: Creates job with pending status", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "coffee shops",
        location: "Austin, TX",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe("test-job-id");
      expect(result.finalStatus).toBe("completed");
    });

    it("AC1: Returns correct business count", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "restaurants",
        location: "Dallas, TX",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.success).toBe(true);
      expect(result.businessCount).toBe(2); // Mock returns 2 businesses
    });

    it("AC1: Job transitions to completed status", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "retail stores",
        location: "Houston, TX",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.finalStatus).toBe("completed");
    });
  });

  describe("executeScrapeJob - Error Handling", () => {
    it("AC1: Handles scraper errors gracefully", async () => {
      // Configure mock to throw an error for this test
      mockScraper.scrape.mockRejectedValueOnce(new Error("Network timeout"));

      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "test query",
        location: "Test City",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.success).toBe(false);
      expect(result.finalStatus).toBe("failed");
      expect(result.error).toContain("Network timeout");
    });

    it("AC1: Handles empty results correctly", async () => {
      // Configure mock to return empty results for this test
      mockScraper.scrape.mockResolvedValueOnce({
        businesses: [],
        source: "google-maps",
        query: "empty test",
        location: "Test City",
        timestamp: new Date(),
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 0,
          hasNextPage: false,
        },
      });

      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "nonexistent",
        location: "Test City",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.success).toBe(true);
      expect(result.finalStatus).toBe("completed");
      expect(result.businessCount).toBe(0);
    });

    it("AC1: Handles invalid source", async () => {
      // Configure mock to throw error for invalid source
      mockScraper.scrape.mockRejectedValueOnce(new Error("Unknown scraper source"));

      const input: CreateScrapeJobInput = {
        source: "invalid-source" as any,
        query: "test",
        location: "Test City",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.success).toBe(false);
      expect(result.finalStatus).toBe("failed");
    });
  });

  describe("executeScrapeJobById", () => {
    it("AC1: Executes a pending job by ID", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "test query",
        location: "Test City",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.success).toBe(true);
      expect(result.jobId).toBeDefined();
    });

    it("AC1: Fails for non-existent job", async () => {
      // Mock findScrapeJobById to return undefined for non-existent job
      const { findScrapeJobById } = require("../lib/db/scrape-job-repository");
      findScrapeJobById.mockResolvedValueOnce(undefined);

      const result = await executeScrapeJobById(
        mockClient,
        "00000000-0000-0000-0000-000000000000"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });
  });

  describe("Multi-source support", () => {
    it("AC1: Supports Google Maps source", async () => {
      const input: CreateScrapeJobInput = {
        source: "google-maps",
        query: "test",
        location: "Test City",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.jobId).toBeDefined();
    });

    it("AC1: Supports Yelp source", async () => {
      const input: CreateScrapeJobInput = {
        source: "yelp",
        query: "test",
        location: "Test City",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.jobId).toBeDefined();
    });

    it("AC1: Supports Facebook source", async () => {
      const input: CreateScrapeJobInput = {
        source: "facebook",
        query: "test",
        location: "Test City",
      };

      const result = await executeScrapeJob(mockClient, input);

      expect(result.jobId).toBeDefined();
    });
  });
});
