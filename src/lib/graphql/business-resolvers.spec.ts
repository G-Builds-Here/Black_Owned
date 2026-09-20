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

/**
 * The resolver runs the INSERT ... RETURNING * through
 * business-repository.rowToBusiness, so the mocked client.query must hand back
 * the raw DB row (snake_case columns, JS Date timestamps) exactly as
 * node-postgres would — not the mapped Business object.
 */
function dbBusinessRow(fields: {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  category_id: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    verification_status: "unverified",
    location: null,
    rating: null,
    review_count: null,
    website: null,
    image_url: null,
    card_image_url: null,
    lat: null,
    lng: null,
    tags: null,
    social_urls: null,
    phone: null,
    menu_url: null,
    rating_source: null,
    ...fields,
  };
}

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

    const mockBusinessRow = dbBusinessRow({
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Ace Cafe",
      description: "Coffee shop",
      category_id: "cat-1",
      created_at: mockDate,
      updated_at: mockDate,
    });

    mockQuery.mockResolvedValue({ rows: [mockBusinessRow] });

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

    const mockBusinessRow = dbBusinessRow({
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Business With Description",
      description: "This is a detailed description of the business",
      category_id: "cat-2",
      created_at: mockDate,
      updated_at: mockDate,
    });

    mockQuery.mockResolvedValue({ rows: [mockBusinessRow] });

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

    const mockBusinessRow = dbBusinessRow({
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Business Without Description",
      description: null,
      category_id: "cat-3",
      created_at: mockDate,
      updated_at: mockDate,
    });

    mockQuery.mockResolvedValue({ rows: [mockBusinessRow] });

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

    const mockBusinessRow = dbBusinessRow({
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Trimmed Business Name",
      description: null,
      category_id: "cat-4",
      created_at: mockDate,
      updated_at: mockDate,
    });

    mockQuery.mockResolvedValue({ rows: [mockBusinessRow] });

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
});
