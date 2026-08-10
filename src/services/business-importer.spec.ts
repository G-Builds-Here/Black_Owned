/**
 * Business Importer Service Tests - LOC-0058-AC4
 *
 * Verifies the business importer service correctly handles
 * single and batch imports of normalized business records.
 */

import { PoolClient } from "pg";
import { BusinessImporter, businessImporter, ImportResult } from "./business-importer";
import { PendingImportBusinessInput } from "../types/pending-import-business";

// Mock the repository module
jest.mock("../lib/db/pending-import-business-repository", () => ({
  insertPendingImportBusiness: jest.fn(),
}));

const { insertPendingImportBusiness } = require("../lib/db/pending-import-business-repository");

describe("Business Importer Service - LOC-0058-AC4", () => {
  let mockClient: PoolClient;
  let importer: BusinessImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as PoolClient;
    importer = new BusinessImporter();
  });

  describe("importBusiness", () => {
    const validInput: PendingImportBusinessInput = {
      name: "Test Business",
      description: "A test business description",
      categoryId: "food-dining",
      sourceData: { source: "google-maps", address: "123 Main St" },
    };

    it("should import a single valid business", async () => {
      insertPendingImportBusiness.mockResolvedValue(undefined);

      await expect(importer.importBusiness(mockClient, validInput)).resolves.not.toThrow();
      expect(insertPendingImportBusiness).toHaveBeenCalledWith(mockClient, validInput);
    });

    it("should throw error when business name is missing", async () => {
      const invalidInput: PendingImportBusinessInput = {
        name: "",
        description: "Test",
        categoryId: "food-dining",
      };

      await expect(importer.importBusiness(mockClient, invalidInput)).rejects.toThrow(
        "Business name is required"
      );
    });

    it("should throw error when business name is whitespace only", async () => {
      const invalidInput: PendingImportBusinessInput = {
        name: "   ",
        description: "Test",
        categoryId: "food-dining",
      };

      await expect(importer.importBusiness(mockClient, invalidInput)).rejects.toThrow(
        "Business name is required"
      );
    });

    it("should throw error when category ID is missing", async () => {
      const invalidInput: PendingImportBusinessInput = {
        name: "Test Business",
        description: "Test",
        categoryId: "",
      };

      await expect(importer.importBusiness(mockClient, invalidInput)).rejects.toThrow(
        "Category ID is required"
      );
    });

    it("should throw error when category ID is whitespace only", async () => {
      const invalidInput: PendingImportBusinessInput = {
        name: "Test Business",
        description: "Test",
        categoryId: "   ",
      };

      await expect(importer.importBusiness(mockClient, invalidInput)).rejects.toThrow(
        "Category ID is required"
      );
    });

    it("should allow undefined description", async () => {
      const input: PendingImportBusinessInput = {
        name: "Test Business",
        description: undefined,
        categoryId: "food-dining",
      };

      insertPendingImportBusiness.mockResolvedValue(undefined);

      await expect(importer.importBusiness(mockClient, input)).resolves.not.toThrow();
    });

    it("should allow undefined sourceData", async () => {
      const input: PendingImportBusinessInput = {
        name: "Test Business",
        description: "Test",
        categoryId: "food-dining",
      };

      insertPendingImportBusiness.mockResolvedValue(undefined);

      await expect(importer.importBusiness(mockClient, input)).resolves.not.toThrow();
    });

    it("should propagate database errors", async () => {
      const errorMessage = "Database connection failed";
      insertPendingImportBusiness.mockRejectedValue(new Error(errorMessage));

      await expect(importer.importBusiness(mockClient, validInput)).rejects.toThrow(errorMessage);
    });
  });

  describe("importBatch", () => {
    const validInputs: PendingImportBusinessInput[] = [
      {
        name: "Business 1",
        description: "First business",
        categoryId: "food-dining",
        sourceData: { source: "google-maps" },
      },
      {
        name: "Business 2",
        description: "Second business",
        categoryId: "retail-fashion",
        sourceData: { source: "yelp" },
      },
      {
        name: "Business 3",
        description: "Third business",
        categoryId: "professional-services",
        sourceData: { source: "facebook" },
      },
    ];

    it("should import all valid businesses successfully", async () => {
      insertPendingImportBusiness.mockResolvedValue(undefined);

      const result: ImportResult = await importer.importBatch(mockClient, validInputs);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(insertPendingImportBusiness).toHaveBeenCalledTimes(3);
    });

    it("should handle empty batch gracefully", async () => {
      const result: ImportResult = await importer.importBatch(mockClient, []);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should continue importing when one business fails", async () => {
      insertPendingImportBusiness.mockImplementation((_, input) => {
        if (input.name === "Business 2") {
          throw new Error("Duplicate entry");
        }
        return Promise.resolve(undefined);
      });

      const result: ImportResult = await importer.importBatch(mockClient, validInputs);

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Business 2");
      expect(result.errors[0]).toContain("Duplicate entry");
    });

    it("should report all failures when all businesses fail", async () => {
      insertPendingImportBusiness.mockRejectedValue(new Error("Database error"));

      const result: ImportResult = await importer.importBatch(mockClient, validInputs);

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(0);
      expect(result.failedCount).toBe(3);
      expect(result.errors).toHaveLength(3);
    });

    it("should include business name in error message", async () => {
      insertPendingImportBusiness.mockImplementation((_, input) => {
        if (input.name === "Business 1") {
          throw new Error("Validation failed");
        }
        return Promise.resolve(undefined);
      });

      const result: ImportResult = await importer.importBatch(mockClient, validInputs);

      expect(result.failedCount).toBe(1);
      expect(result.errors[0]).toContain("Business 1");
      expect(result.errors[0]).toContain("Validation failed");
    });

    it("should handle unknown error types", async () => {
      insertPendingImportBusiness.mockImplementation(() => {
        throw new Error("Unknown database error");
      });

      const result: ImportResult = await importer.importBatch(mockClient, validInputs);

      expect(result.failedCount).toBe(3);
      expect(result.errors[0]).toContain("Unknown database error");
    });

    it("should handle large batches", async () => {
      const largeBatch = Array.from({ length: 100 }, (_, i) => ({
        name: `Business ${i}`,
        description: `Description ${i}`,
        categoryId: "food-dining",
        sourceData: { source: "google-maps" },
      }));

      insertPendingImportBusiness.mockResolvedValue(undefined);

      const result: ImportResult = await importer.importBatch(mockClient, largeBatch);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(100);
      expect(result.failedCount).toBe(0);
    });
  });

  describe("singleton instance", () => {
    it("should export a singleton instance", () => {
      expect(businessImporter).toBeInstanceOf(BusinessImporter);
    });

    it("should be the same instance across imports", () => {
      const importer1 = businessImporter;
      const importer2 = businessImporter;

      expect(importer1).toBe(importer2);
    });
  });
});
