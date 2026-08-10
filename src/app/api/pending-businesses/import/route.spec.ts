/**
 * POST /api/pending-businesses/import Tests
 *
 * Tests for the batch import endpoint for normalized businesses.
 */

import { NextRequest } from "next/server";
import { POST } from "./route";

// Mock the database module
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/pending-import-business-repository", () => ({
  importNormalizedBusinesses: jest.fn(),
}));

const { getPool } = require("@/lib/db/user-repository");
const { importNormalizedBusinesses } = require("@/lib/db/pending-import-business-repository");

describe("POST /api/pending-businesses/import", () => {
  const mockPool = {
    connect: jest.fn(),
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getPool.mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it("should reject request without businesses array", async () => {
    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errors[0].error).toContain("'businesses' array");
  });

  it("should reject request with non-array businesses", async () => {
    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({ businesses: "not-an-array" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("should reject business with missing name", async () => {
    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: [
          {
            description: "Test",
            category_id: "food-dining",
            source_data: {},
            source: "google-maps",
            originalId: "test-1",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errors[0].error).toContain("name is required");
  });

  it("should reject business with missing category_id", async () => {
    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: [
          {
            name: "Test Business",
            description: "Test",
            source_data: {},
            source: "google-maps",
            originalId: "test-1",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errors[0].error).toContain("Category ID is required");
  });

  it("should successfully import a single normalized business", async () => {
    const mockImportResult = {
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [
        {
          success: true,
          businessId: "test-business-id",
          source: "google-maps",
          originalId: "test-123",
        },
      ],
      errors: [],
    };

    importNormalizedBusinesses.mockResolvedValue(mockImportResult);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: [
          {
            name: "Test Business",
            description: "A test business",
            category_id: "food-dining",
            source_data: { source: "google-maps", address: "123 Main St" },
            source: "google-maps",
            originalId: "test-123",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.total).toBe(1);
    expect(json.succeeded).toBe(1);
    expect(json.failed).toBe(0);
    expect(json.results[0].success).toBe(true);
    expect(json.results[0].businessId).toBe("test-business-id");
  });

  it("should successfully import multiple businesses in a single transaction", async () => {
    const mockImportResult = {
      total: 3,
      succeeded: 3,
      failed: 0,
      results: [
        { success: true, businessId: "biz-1-id", source: "google-maps", originalId: "biz-1" },
        { success: true, businessId: "biz-2-id", source: "yelp", originalId: "biz-2" },
        { success: true, businessId: "biz-3-id", source: "facebook", originalId: "biz-3" },
      ],
      errors: [],
    };

    importNormalizedBusinesses.mockResolvedValue(mockImportResult);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: [
          {
            name: "Business 1",
            description: "First business",
            category_id: "food-dining",
            source_data: { source: "google-maps" },
            source: "google-maps",
            originalId: "biz-1",
          },
          {
            name: "Business 2",
            description: "Second business",
            category_id: "retail-fashion",
            source_data: { source: "yelp" },
            source: "yelp",
            originalId: "biz-2",
          },
          {
            name: "Business 3",
            description: "Third business",
            category_id: "professional-services",
            source_data: { source: "facebook" },
            source: "facebook",
            originalId: "biz-3",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.total).toBe(3);
    expect(json.succeeded).toBe(3);
    expect(json.failed).toBe(0);
    expect(json.results).toHaveLength(3);
  });

  it("should handle empty batch gracefully", async () => {
    const mockImportResult = {
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      errors: [],
    };

    importNormalizedBusinesses.mockResolvedValue(mockImportResult);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({ businesses: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.total).toBe(0);
    expect(json.succeeded).toBe(0);
    expect(json.failed).toBe(0);
  });

  it("should handle undefined description", async () => {
    const mockImportResult = {
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [
        {
          success: true,
          businessId: "no-desc-id",
          source: "google-maps",
          originalId: "no-desc-1",
        },
      ],
      errors: [],
    };

    importNormalizedBusinesses.mockResolvedValue(mockImportResult);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: [
          {
            name: "No Description Business",
            category_id: "food-dining",
            source_data: { source: "google-maps" },
            source: "google-maps",
            originalId: "no-desc-1",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.succeeded).toBe(1);
  });

  it("should record import count when jobId is provided", async () => {
    const mockImportResult = {
      total: 2,
      succeeded: 2,
      failed: 0,
      results: [
        { success: true, businessId: "count-1-id", source: "google-maps", originalId: "count-1" },
        { success: true, businessId: "count-2-id", source: "yelp", originalId: "count-2" },
      ],
      errors: [],
    };

    importNormalizedBusinesses.mockResolvedValue(mockImportResult);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: [
          {
            name: "Count Test 1",
            description: "Test 1",
            category_id: "food-dining",
            source_data: { source: "google-maps" },
            source: "google-maps",
            originalId: "count-1",
          },
          {
            name: "Count Test 2",
            description: "Test 2",
            category_id: "retail-fashion",
            source_data: { source: "yelp" },
            source: "yelp",
            originalId: "count-2",
          },
        ],
        jobId: "test-job-id",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.succeeded).toBe(2);

    // Verify importNormalizedBusinesses was called with jobId
    expect(importNormalizedBusinesses).toHaveBeenCalledWith(
      expect.any(Object),
      expect.arrayContaining([
        expect.objectContaining({ originalId: "count-1" }),
        expect.objectContaining({ originalId: "count-2" }),
      ]),
      "test-job-id"
    );
  });

  it("should rollback and return error when database transaction fails", async () => {
    mockClient.query.mockRejectedValueOnce(new Error("Transaction failed"));

    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: [
          {
            name: "Failing Business",
            category_id: "food-dining",
            source_data: {},
            source: "google-maps",
            originalId: "fail-1",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.errors[0].error).toBe("Transaction failed");
  });

  it("should handle large batches", async () => {
    const largeBatch = Array.from({ length: 50 }, (_, i) => ({
      success: true,
      businessId: `large-${i}-id`,
      source: "google-maps",
      originalId: `large-${i}`,
    }));

    const mockImportResult = {
      total: 50,
      succeeded: 50,
      failed: 0,
      results: largeBatch,
      errors: [],
    };

    importNormalizedBusinesses.mockResolvedValue(mockImportResult);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({
        businesses: Array.from({ length: 50 }, (_, i) => ({
          name: `Business ${i}`,
          description: `Description ${i}`,
          category_id: "food-dining",
          source_data: { source: "google-maps" },
          source: "google-maps",
          originalId: `large-${i}`,
        })),
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.total).toBe(50);
    expect(json.succeeded).toBe(50);
    expect(json.failed).toBe(0);
  });

  it("should return 400 when businesses array is empty string", async () => {
    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({ businesses: "" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
