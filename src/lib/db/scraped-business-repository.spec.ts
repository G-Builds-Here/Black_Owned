/**
 * Scraped Business Repository Tests
 */

import { PoolClient } from "pg";
import {
  createScrapedBusiness,
  findScrapedBusinessesByJobId,
  findScrapedBusinessById,
  updateScrapedBusinessStatus,
  deleteScrapedBusiness,
  deleteScrapedBusinessesByJobId,
  countScrapedBusinessesByJobId,
  initializeScrapedBusinessSchema,
} from "./scraped-business-repository";
import { getPool } from "./user-repository";
import { CreateScrapedBusinessInput } from "../../types/scraped-business";
import { ScraperSource } from "../../types/scraper-result";

describe("ScrapedBusinessRepository", () => {
  let client: PoolClient;

  const mockInput: CreateScrapedBusinessInput = {
    scrapeJobId: "12345678-1234-1234-1234-123456789abc",
    source: ScraperSource.GOOGLE_MAPS,
    name: "Test Business",
    address: "123 Test St",
    phone: "555-1234",
    website: "https://test.com",
    category: "retail",
    rating: 4.5,
    reviewCount: 100,
  };

  beforeAll(async () => {
    client = getPool().createClient();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    // Create schema
    await initializeScrapedBusinessSchema(client);
  });

  afterEach(async () => {
    // Clean up test data
    await client.query("DELETE FROM scraped_businesses");
  });

  describe("createScrapedBusiness", () => {
    it("should create a new scraped business record", async () => {
      const result = await createScrapedBusiness(client, mockInput);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.scrapeJobId).toBe(mockInput.scrapeJobId);
      expect(result.source).toBe(mockInput.source);
      expect(result.name).toBe(mockInput.name);
      expect(result.address).toBe(mockInput.address);
      expect(result.phone).toBe(mockInput.phone);
      expect(result.website).toBe(mockInput.website);
      expect(result.category).toBe(mockInput.category);
      expect(result.rating).toBe(mockInput.rating);
      expect(result.reviewCount).toBe(mockInput.reviewCount);
      expect(result.status).toBe("pending_review");
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("findScrapedBusinessesByJobId", () => {
    it("should return empty array when no businesses found", async () => {
      const result = await findScrapedBusinessesByJobId(client, "12345678-1234-1234-1234-123456789abc");
      expect(result).toEqual([]);
    });

    it("should return businesses for a specific job", async () => {
      const jobId = "12345678-1234-1234-1234-123456789abc";

      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId });
      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId, name: "Business 2" });

      const result = await findScrapedBusinessesByJobId(client, jobId);

      expect(result.length).toBe(2);
      expect(result[0].name).toBe("Business 2");
      expect(result[1].name).toBe("Test Business");
    });

    it("should not return businesses from other jobs", async () => {
      const jobId1 = "12345678-1234-1234-123434-123456789abc";
      const jobId2 = "87654321-4321-4321-4321-cba987654321";

      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId1 });
      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId2, name: "Other Job Business" });

      const result = await findScrapedBusinessesByJobId(client, jobId1);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Test Business");
    });
  });

  describe("findScrapedBusinessById", () => {
    it("should return undefined for non-existent business", async () => {
      const result = await findScrapedBusinessById(client, "12345678-1234-1234-1234-123456789abc");
      expect(result).toBeUndefined();
    });

    it("should return business by ID", async () => {
      const created = await createScrapedBusiness(client, mockInput);
      const result = await findScrapedBusinessById(client, created.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe(mockInput.name);
    });
  });

  describe("updateScrapedBusinessStatus", () => {
    it("should update business status", async () => {
      const created = await createScrapedBusiness(client, mockInput);

      const updated = await updateScrapedBusinessStatus(client, created.id, "approved");

      expect(updated).toBeDefined();
      expect(updated?.status).toBe("approved");
      expect(updated?.updatedAt).toBeInstanceOf(Date);
    });

    it("should return undefined for non-existent business", async () => {
      const result = await updateScrapedBusinessStatus(
        client,
        "12345678-1234-1234-1234-123456789abc",
        "approved"
      );
      expect(result).toBeUndefined();
    });
  });

  describe("deleteScrapedBusiness", () => {
    it("should delete a business", async () => {
      const created = await createScrapedBusiness(client, mockInput);

      const deleted = await deleteScrapedBusiness(client, created.id);

      expect(deleted).toBe(true);

      const result = await findScrapedBusinessById(client, created.id);
      expect(result).toBeUndefined();
    });

    it("should return false for non-existent business", async () => {
      const result = await deleteScrapedBusiness(client, "12345678-1234-1234-1234-123456789abc");
      expect(result).toBe(false);
    });
  });

  describe("deleteScrapedBusinessesByJobId", () => {
    it("should delete all businesses for a job", async () => {
      const jobId = "12345678-1234-1234-1234-123456789abc";

      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId });
      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId, name: "Business 2" });

      const deletedCount = await deleteScrapedBusinessesByJobId(client, jobId);

      expect(deletedCount).toBe(2);

      const remaining = await findScrapedBusinessesByJobId(client, jobId);
      expect(remaining.length).toBe(0);
    });
  });

  describe("countScrapedBusinessesByJobId", () => {
    it("should return 0 when no businesses exist", async () => {
      const count = await countScrapedBusinessesByJobId(client, "12345678-1234-1234-1234-123456789abc");
      expect(count).toBe(0);
    });

    it("should return correct count", async () => {
      const jobId = "12345678-1234-1234-1234-123456789abc";

      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId });
      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId, name: "Business 2" });
      await createScrapedBusiness(client, { ...mockInput, scrapeJobId: jobId, name: "Business 3" });

      const count = await countScrapedBusinessesByJobId(client, jobId);

      expect(count).toBe(3);
    });
  });
});
