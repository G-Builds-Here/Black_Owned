/**
 * POST /api/pending-businesses/import Tests
 *
 * Tests for the batch import endpoint for normalized businesses.
 */

import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";

// Mock the database module
jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/pending-import-business-repository", () => ({
  importNormalizedBusinesses: jest.fn(),
}));

// Mock the business-data-validator
jest.mock("@/lib/utils/business-data-validator", () => ({
  validateBusinessData: jest.fn(),
}));

const { getPool } = require("@/lib/db/user-repository");
const { importNormalizedBusinesses } = require("@/lib/db/pending-import-business-repository");
const { validateBusinessData } = require("@/lib/utils/business-data-validator");

jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

const { createAuthMiddleware, createAuthErrorResponse } = require("@/lib/auth/jwt-middleware");

const AUTH_OK = {
  authenticated: true,
  user: { userId: "u-admin", email: "admin@example.com", role: "admin" },
  statusCode: 200,
};
const AUTH_FAIL = {
  authenticated: false,
  errorType: "NO_AUTH_HEADER",
  errorMessage: "Authorization header is required",
  statusCode: 401,
};

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
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_OK));
    (createAuthErrorResponse as jest.Mock).mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
    getPool.mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it("returns 401 when the request is not authenticated as admin", async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_FAIL));
    const request = new NextRequest("http://localhost/api/pending-businesses/import", {
      method: "POST",
      body: JSON.stringify({ businesses: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
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
    // Mock validation to pass
    validateBusinessData.mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: undefined,
    });

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
    expect(json.data.total).toBe(1);
    expect(json.data.succeeded).toBe(1);
    expect(json.data.failed).toBe(0);
    expect(json.data.results[0].success).toBe(true);
    expect(json.data.results[0].businessId).toBe("test-business-id");
  });

  it("should successfully import multiple businesses in a single transaction", async () => {
    // Mock validation to pass for all 3 businesses
    validateBusinessData
      .mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitized: undefined,
      })
      .mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitized: undefined,
      })
      .mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitized: undefined,
      });

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
    expect(json.data.total).toBe(3);
    expect(json.data.succeeded).toBe(3);
    expect(json.data.failed).toBe(0);
    expect(json.data.results).toHaveLength(3);
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
    expect(json.data.total).toBe(0);
    expect(json.data.succeeded).toBe(0);
    expect(json.data.failed).toBe(0);
  });

  it("should handle undefined description", async () => {
    // Mock validation to pass
    validateBusinessData.mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: undefined,
    });

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
    expect(json.data.succeeded).toBe(1);
  });

  it("should record import count when jobId is provided", async () => {
    // Mock validation to pass for both businesses
    validateBusinessData
      .mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitized: undefined,
      })
      .mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitized: undefined,
      });

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
    expect(json.data.succeeded).toBe(2);

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
    // Mock validation to pass
    validateBusinessData.mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: undefined,
    });

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

    // Mock validation to pass for all 50 businesses
    validateBusinessData.mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: undefined,
    });

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
    expect(json.data.total).toBe(50);
    expect(json.data.succeeded).toBe(50);
    expect(json.data.failed).toBe(0);
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

  describe("business data validation", () => {
    beforeEach(() => {
      // Reset mock before each test to avoid state pollution
      validateBusinessData.mockReset();
    });

    it("should reject import when business data fails validation", async () => {
      // Mock validation failure for the first business
      validateBusinessData.mockReturnValueOnce({
        isValid: false,
        errors: [
          { field: "phone", message: "Invalid phone format: abc-def-ghij", value: "abc-def-ghij" },
        ],
        warnings: [],
        sanitized: undefined,
      });

      const request = new NextRequest("http://localhost/api/pending-businesses/import", {
        method: "POST",
        body: JSON.stringify({
          businesses: [
            {
              name: "Invalid Business",
              category_id: "food-dining",
              source_data: {},
              source: "google-maps",
              originalId: "test-1",
              phone: "abc-def-ghij",
            },
          ],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.errors[0].error).toContain("Business data validation failed");
      expect(json.errors[0].error).toContain("Invalid phone format");
    });

    it("should reject import when rating is out of range", async () => {
      validateBusinessData.mockReturnValueOnce({
        isValid: false,
        errors: [
          { field: "rating", message: "Rating must be between 1 and 5, got: 6", value: 6 },
        ],
        warnings: [],
        sanitized: undefined,
      });

      const request = new NextRequest("http://localhost/api/pending-businesses/import", {
        method: "POST",
        body: JSON.stringify({
          businesses: [
            {
              name: "Bad Rating Business",
              category_id: "food-dining",
              source_data: {},
              source: "google-maps",
              originalId: "test-1",
              rating: 6,
            },
          ],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.errors[0].error).toContain("Rating must be between 1 and 5");
    });

    it("should reject import when category is invalid", async () => {
      validateBusinessData.mockReturnValueOnce({
        isValid: false,
        errors: [
          { field: "categoryId", message: "Category ID is required", value: "" },
        ],
        warnings: [],
        sanitized: undefined,
      });

      const request = new NextRequest("http://localhost/api/pending-businesses/import", {
        method: "POST",
        body: JSON.stringify({
          businesses: [
            {
              name: "No Category Business",
              category_id: "",
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

    it("should allow import when business data passes validation", async () => {
      // Mock validation to pass for the one business being imported
      validateBusinessData.mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitized: {
          name: "Valid Business",
          categoryId: "food-dining",
          source: "google-maps",
        },
      });

      importNormalizedBusinesses.mockResolvedValue({
        total: 1,
        succeeded: 1,
        failed: 0,
        results: [{ success: true, businessId: "valid-id", source: "google-maps", originalId: "test-1" }],
        errors: [],
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const request = new NextRequest("http://localhost/api/pending-businesses/import", {
        method: "POST",
        body: JSON.stringify({
          businesses: [
            {
              name: "Valid Business",
              category_id: "restaurant",
              source_data: {},
              source: "google-maps",
              originalId: "test-1",
              phone: "555-123-4567",
              email: "test@example.com",
              rating: 4.5,
            },
          ],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.succeeded).toBe(1);
    });

    it("should log warnings when business data has warnings but passes validation", async () => {
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      validateBusinessData.mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: ['Unknown category "unknown-category" - will use "other" as fallback'],
        sanitized: {
          name: "Warning Business",
          categoryId: "other",
          source: "google-maps",
        },
      });

      importNormalizedBusinesses.mockResolvedValue({
        total: 1,
        succeeded: 1,
        failed: 0,
        results: [{ success: true, businessId: "warning-id", source: "google-maps", originalId: "test-1" }],
        errors: [],
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const request = new NextRequest("http://localhost/api/pending-businesses/import", {
        method: "POST",
        body: JSON.stringify({
          businesses: [
            {
              name: "Warning Business",
              category_id: "unknown-category",
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

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Business data warnings")
      );

      consoleWarnSpy.mockRestore();
    });

    it("should validate multiple businesses and reject if any fail", async () => {
      // First business passes, second fails
      validateBusinessData
        .mockReturnValueOnce({
          isValid: true,
          errors: [],
          warnings: [],
          sanitized: undefined,
        })
        .mockReturnValueOnce({
          isValid: false,
          errors: [{ field: "email", message: "Invalid email format: invalid-email", value: "invalid-email" }],
          warnings: [],
          sanitized: undefined,
        });

      const request = new NextRequest("http://localhost/api/pending-businesses/import", {
        method: "POST",
        body: JSON.stringify({
          businesses: [
            {
              name: "Valid Business",
              category_id: "food-dining",
              source_data: {},
              source: "google-maps",
              originalId: "test-1",
            },
            {
              name: "Invalid Business",
              category_id: "food-dining",
              source_data: {},
              source: "google-maps",
              originalId: "test-2",
              email: "invalid-email",
            },
          ],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.errors[0].error).toContain("Invalid email format");
    });
  });
});
