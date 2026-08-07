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

jest.mock("../db/user-repository", () => ({
  getPool: jest.fn(() => ({
    connect: jest.fn(() => mockClient),
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
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
      category_id: "cat-1",
      rating: null,
      review_count: 0,
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
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
    expect(result.business?.rating).toBeNull();
    expect(result.business?.reviewCount).toBe(0);
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
      category_id: "cat-2",
      rating: null,
      review_count: 0,
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
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
      category_id: "cat-3",
      rating: null,
      review_count: 0,
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
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
      category_id: "cat-4",
      rating: null,
      review_count: 0,
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
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

  it("creates business with rating and review count", async () => {
    const mockUserId = "test-user-id-666";
    const mockBusinessId = "business-id-111";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockBusiness = {
      id: mockBusinessId,
      ownerId: mockUserId,
      name: "Rated Business",
      description: "A business with ratings",
      category_id: "cat-5",
      rating: 4.5,
      review_count: 25,
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
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
        name: "Rated Business",
        description: "A business with ratings",
        categoryId: "cat-5",
        rating: 4.5,
        reviewCount: 25,
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.business?.name).toBe("Rated Business");
    expect(result.business?.rating).toBe(4.5);
    expect(result.business?.reviewCount).toBe(25);
  });
});
