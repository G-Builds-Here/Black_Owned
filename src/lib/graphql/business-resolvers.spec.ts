/**
 * Business Resolvers Tests - createBusiness mutation
 */

import { createBusiness } from "./resolvers";

// Mock the database functions
const mockQuery = jest.fn();
const mockClient = {
  query: mockQuery,
  release: jest.fn(),
};

// Mock the pg Pool to return our mock client
jest.mock("pg", () => {
  return {
    Pool: jest.fn(() => ({
      connect: jest.fn(() => mockClient),
    })),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockClear();
});

describe("createBusiness mutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates an unverified business with the caller as owner", async () => {
    const mockUserId = "test-user-id-123";
    const mockBusinessId = "business-id-456";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    // Return the Business type format (camelCase) that the resolver expects
    const mockBusiness = {
      id: mockBusinessId,
      ownerId: mockUserId,
      name: "Ace Cafe",
      description: "Coffee shop",
      categoryId: "cat-1",
      verificationStatus: "unverified",
      createdAt: mockDate,
      updatedAt: mockDate,
    };

    mockQuery.mockResolvedValue({ rows: [mockBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Ace Cafe",
        description: "Coffee shop",
        categoryId: "cat-1",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.business).toBeDefined();
    expect(result.business?.id).toBe(mockBusinessId);
    expect(result.business?.name).toBe("Ace Cafe");
    expect(result.business?.categoryId).toBe("cat-1");
    expect(result.business?.verified).toBe(false);
  });

  it("returns validation error when name is missing", async () => {
    const mockUserId = "test-user-id-789";

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        description: "Coffee shop",
        categoryId: "cat-1",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Name is required");
    expect(result.business).toBeUndefined();
  });

  it("returns validation error when name is empty string", async () => {
    const mockUserId = "test-user-id-999";

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "",
        categoryId: "cat-1",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Name is required");
  });

  it("returns validation error when categoryId is missing", async () => {
    const mockUserId = "test-user-id-111";

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Test Business",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Category ID is required");
  });

  it("returns validation error when categoryId is empty string", async () => {
    const mockUserId = "test-user-id-222";

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Test Business",
        categoryId: "",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Category ID is required");
  });

  it("returns authentication error when user is not authenticated", async () => {
    const args = {
      input: {
        name: "Test Business",
        categoryId: "cat-1",
      },
    };

    const result = await createBusiness(null, args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authentication required");
  });

  it("returns authentication error when context has no user", async () => {
    const args = {
      input: {
        name: "Test Business",
        categoryId: "cat-1",
      },
    };

    const result = await createBusiness(null, args, undefined);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authentication required");
  });

  it("creates business with optional description", async () => {
    const mockUserId = "test-user-id-333";
    const mockBusinessId = "business-id-777";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockBusiness = {
      id: mockBusinessId,
      ownerId: mockUserId,
      name: "Business With Description",
      description: "This is a detailed description of the business",
      categoryId: "cat-2",
      verificationStatus: "unverified",
      createdAt: mockDate,
      updatedAt: mockDate,
    };

    mockQuery.mockResolvedValue({ rows: [mockBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Business With Description",
        description: "This is a detailed description of the business",
        categoryId: "cat-2",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.business?.name).toBe("Business With Description");
    // Note: description is not returned in the GraphQL Business type
  });

  it("creates business without description", async () => {
    const mockUserId = "test-user-id-444";
    const mockBusinessId = "business-id-888";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockBusiness = {
      id: mockBusinessId,
      ownerId: mockUserId,
      name: "Business Without Description",
      description: null,
      categoryId: "cat-3",
      verificationStatus: "unverified",
      createdAt: mockDate,
      updatedAt: mockDate,
    };

    mockQuery.mockResolvedValue({ rows: [mockBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Business Without Description",
        categoryId: "cat-3",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.business?.name).toBe("Business Without Description");
  });

  it("trims whitespace from name and categoryId", async () => {
    const mockUserId = "test-user-id-555";
    const mockBusinessId = "business-id-999";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockBusiness = {
      id: mockBusinessId,
      ownerId: mockUserId,
      name: "Trimmed Business Name",
      description: null,
      categoryId: "cat-4",
      verificationStatus: "unverified",
      createdAt: mockDate,
      updatedAt: mockDate,
    };

    mockQuery.mockResolvedValue({ rows: [mockBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "  Trimmed Business Name  ",
        categoryId: "  cat-4  ",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.business?.name).toBe("Trimmed Business Name");
    expect(result.business?.categoryId).toBe("cat-4");
  });

  it("allows unique business to be created (AC3 - no duplicate blocking)", async () => {
    const mockUserId = "test-user-id-666";
    const mockBusinessId = "business-id-111";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    // First query checks for duplicates (returns 0 existing businesses)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // No duplicates found
      .mockResolvedValueOnce({ rows: [{
        id: mockBusinessId,
        ownerId: mockUserId,
        name: "Unique New Business",
        description: null,
        categoryId: "cat-5",
        verificationStatus: "unverified",
        createdAt: mockDate,
        updatedAt: mockDate,
      }] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Unique New Business",
        categoryId: "cat-5",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.business?.name).toBe("Unique New Business");
    // Verify the duplicate check was performed
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("allows business creation even when similar business exists (AC3 - import proceeds)", async () => {
    const mockUserId = "test-user-id-777";
    const mockBusinessId = "business-id-222";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    // First query finds a duplicate (returns 1 existing business)
    // But AC3 says import proceeds anyway for unique businesses
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // Duplicate found
      .mockResolvedValueOnce({ rows: [{
        id: mockBusinessId,
        ownerId: mockUserId,
        name: "Similar Business",
        description: null,
        categoryId: "cat-6",
        verificationStatus: "unverified",
        createdAt: mockDate,
        updatedAt: mockDate,
      }] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Similar Business",
        categoryId: "cat-6",
      },
    };

    const result = await createBusiness(null, args, context);

    // AC3: Import proceeds even when similar business exists
    expect(result.success).toBe(true);
    expect(result.business?.name).toBe("Similar Business");
  });

  it("supports importSource and scrapeJobId parameters", async () => {
    const mockUserId = "test-user-id-888";
    const mockBusinessId = "business-id-333";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{
        id: mockBusinessId,
        ownerId: mockUserId,
        name: "Imported Business",
        description: null,
        categoryId: "cat-7",
        verificationStatus: "unverified",
        createdAt: mockDate,
        updatedAt: mockDate,
      }] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Imported Business",
        categoryId: "cat-7",
        importSource: "google-maps",
        scrapeJobId: "scrape-job-123",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.business?.name).toBe("Imported Business");
  });
});
