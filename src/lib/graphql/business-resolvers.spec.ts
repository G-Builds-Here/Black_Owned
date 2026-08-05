/**
 * Business Resolvers Tests - createBusiness mutation
 */

import { createBusiness } from "./resolvers";

// Mock the database functions before importing resolvers
const mockQuery = jest.fn();
const mockClient = {
  query: mockQuery,
  release: jest.fn(),
};

jest.mock("../db/user-repository", () => ({
  findByEmail: jest.fn(),
  create: jest.fn(),
  initializeUserSchema: jest.fn(),
  getPool: jest.fn(() => ({
    connect: jest.fn(() => mockClient),
  })),
}));

const mockFindBusinessByPhone = jest.fn();
const mockNormalizePhoneNumber = jest.fn((phone: string) => phone?.replace(/\D/g, ""));

jest.mock("../db/business-repository", () => ({
  findBusinessByPhone: jest.fn(),
  normalizePhoneNumber: jest.fn((phone: string) => {
    const digits = phone?.trim().replace(/\D/g, "");
    // Strip leading "1" for 11-digit US numbers
    return digits?.length === 11 && digits.startsWith("1") ? digits.substring(1) : digits;
  }),
}));

jest.mock("../minio/minio-service", () => ({
  createMinioServiceFromEnv: jest.fn(() => ({
    generatePresignedPutUrlsBatch: jest.fn(),
  })),
  MinioService: jest.fn(),
}));

const businessRepo = require("../db/business-repository");

beforeEach(() => {
  jest.clearAllMocks();
  // Reset mock implementations for business-repository
  businessRepo.findBusinessByPhone.mockReset();
  businessRepo.normalizePhoneNumber.mockReset();
  businessRepo.normalizePhoneNumber.mockImplementation((phone: string) => {
    const digits = phone?.trim().replace(/\D/g, "");
    // Strip leading "1" for 11-digit US numbers
    return digits?.length === 11 && digits.startsWith("1") ? digits.substring(1) : digits;
  });
});

describe("createBusiness mutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations for business-repository
    businessRepo.findBusinessByPhone.mockReset();
    businessRepo.normalizePhoneNumber.mockReset();
    businessRepo.normalizePhoneNumber.mockImplementation((phone: string) => {
      const digits = phone?.trim().replace(/\D/g, "");
      // Strip leading "1" for 11-digit US numbers
      return digits?.length === 11 && digits.startsWith("1") ? digits.substring(1) : digits;
    });
  });

  it("creates an unverified business with the caller as owner", async () => {
    const mockUserId = "test-user-id-123";
    const mockBusinessId = "business-id-456";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    // Return the database row format (snake_case) that the resolver expects
    const mockBusiness = {
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Ace Cafe",
      description: "Coffee shop",
      category_id: "cat-1",
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
      phone: undefined,
      potential_duplicate_id: undefined,
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
      owner_id: mockUserId,
      name: "Business With Description",
      description: "This is a detailed description of the business",
      category_id: "cat-2",
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
      phone: undefined,
      potential_duplicate_id: undefined,
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
      owner_id: mockUserId,
      name: "Business Without Description",
      description: null,
      category_id: "cat-3",
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
      phone: undefined,
      potential_duplicate_id: undefined,
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
      owner_id: mockUserId,
      name: "Trimmed Business Name",
      description: null,
      category_id: "cat-4",
      verification_status: "unverified",
      created_at: mockDate,
      updated_at: mockDate,
      phone: undefined,
      potential_duplicate_id: undefined,
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

  it("detects potential duplicate when phone number matches existing business", async () => {
    const mockUserId = "test-user-id-666";
    const mockBusinessId = "new-business-id-123";
    const mockExistingBusinessId = "existing-business-id-456";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockExistingBusiness = {
      id: mockExistingBusinessId,
      owner_id: "owner-123",
      name: "Existing Cafe",
      description: "Existing coffee shop",
      category_id: "cat-1",
      verification_status: "unverified",
      phone: "5551234567",
      potential_duplicate_id: undefined,
      created_at: mockDate,
      updated_at: mockDate,
    };

    const mockNewBusiness = {
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "New Cafe",
      description: "New coffee shop",
      category_id: "cat-1",
      verification_status: "unverified",
      phone: "5551234567",
      potential_duplicate_id: mockExistingBusinessId,
      created_at: mockDate,
      updated_at: mockDate,
    };

    // Mock findBusinessByPhone to return existing business
    businessRepo.findBusinessByPhone.mockResolvedValue(mockExistingBusiness);

    // Query for createBusiness call
    mockQuery.mockResolvedValue({ rows: [mockNewBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "newowner@example.com",
      },
    };

    const args = {
      input: {
        name: "New Cafe",
        description: "New coffee shop",
        categoryId: "cat-1",
        phone: "(555) 123-4567",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.isPotentialDuplicate).toBe(true);
    expect(result.existingBusinessId).toBe(mockExistingBusinessId);
  });

  it("does not flag duplicate when phone number is unique", async () => {
    const mockUserId = "test-user-id-777";
    const mockBusinessId = "new-business-id-789";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockNewBusiness = {
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Unique Business",
      description: "A unique business",
      category_id: "cat-2",
      verification_status: "unverified",
      phone: "5559876543",
      potential_duplicate_id: undefined,
      created_at: mockDate,
      updated_at: mockDate,
    };

    // Mock findBusinessByPhone to return undefined (no duplicate)
    businessRepo.findBusinessByPhone.mockResolvedValue(undefined);

    // Query for createBusiness call
    mockQuery.mockResolvedValue({ rows: [mockNewBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Unique Business",
        description: "A unique business",
        categoryId: "cat-2",
        phone: "555-987-6543",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.isPotentialDuplicate).toBe(false);
    expect(result.existingBusinessId).toBeUndefined();
  });

  it("handles business creation without phone number", async () => {
    const mockUserId = "test-user-id-888";
    const mockBusinessId = "new-business-id-999";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockNewBusiness = {
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Business No Phone",
      description: "Business without phone",
      category_id: "cat-3",
      verification_status: "unverified",
      phone: undefined,
      potential_duplicate_id: undefined,
      created_at: mockDate,
      updated_at: mockDate,
    };

    mockQuery.mockResolvedValue({ rows: [mockNewBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Business No Phone",
        description: "Business without phone",
        categoryId: "cat-3",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.isPotentialDuplicate).toBe(false);
    expect(result.existingBusinessId).toBeUndefined();
  });

  it("handles empty phone string without flagging duplicate", async () => {
    const mockUserId = "test-user-id-999";
    const mockBusinessId = "new-business-id-111";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockNewBusiness = {
      id: mockBusinessId,
      owner_id: mockUserId,
      name: "Business Empty Phone",
      description: "Business with empty phone",
      category_id: "cat-4",
      verification_status: "unverified",
      phone: undefined,
      potential_duplicate_id: undefined,
      created_at: mockDate,
      updated_at: mockDate,
    };

    mockQuery.mockResolvedValue({ rows: [mockNewBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    const args = {
      input: {
        name: "Business Empty Phone",
        description: "Business with empty phone",
        categoryId: "cat-4",
        phone: "",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.isPotentialDuplicate).toBe(false);
    expect(result.existingBusinessId).toBeUndefined();
  });

  it("normalizes phone number before duplicate check (different formats, same number)", async () => {
    const mockUserId = "test-user-id-111";
    const mockBusinessId = "new-business-id-222";
    const mockExistingBusinessId = "existing-business-id-333";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockExistingBusiness = {
      id: mockExistingBusinessId,
      ownerId: "owner-456",
      name: "Original Business",
      description: "Original business",
      category_id: "cat-1",
      verification_status: "unverified",
      phone: "5551234567",
      potential_duplicate_id: undefined,
      created_at: mockDate,
      updated_at: mockDate,
    };

    const mockNewBusiness = {
      id: mockBusinessId,
      ownerId: mockUserId,
      name: "Duplicate Business",
      description: "Duplicate business",
      category_id: "cat-1",
      verification_status: "unverified",
      phone: "5551234567",
      potential_duplicate_id: mockExistingBusinessId,
      created_at: mockDate,
      updated_at: mockDate,
    };

    // Mock findBusinessByPhone to return existing business
    businessRepo.findBusinessByPhone.mockResolvedValue(mockExistingBusiness);

    // Query for createBusiness call
    mockQuery.mockResolvedValue({ rows: [mockNewBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    // Phone in different format but same number
    const args = {
      input: {
        name: "Duplicate Business",
        description: "Duplicate business",
        categoryId: "cat-1",
        phone: "+1 (555) 123-4567",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.isPotentialDuplicate).toBe(true);
    expect(result.existingBusinessId).toBe(mockExistingBusinessId);
  });

  it("normalizes phone number before duplicate check (different formats, same number)", async () => {
    const mockUserId = "test-user-id-111";
    const mockBusinessId = "new-business-id-222";
    const mockExistingBusinessId = "existing-business-id-333";
    const mockDate = new Date("2026-07-19T10:00:00Z");

    const mockExistingBusiness = {
      id: mockExistingBusinessId,
      ownerId: "owner-456",
      name: "Original Business",
      description: "Original business",
      category_id: "cat-1",
      verification_status: "unverified",
      phone: "5551234567",
      potential_duplicate_id: undefined,
      created_at: mockDate,
      updated_at: mockDate,
    };

    const mockNewBusiness = {
      id: mockBusinessId,
      ownerId: mockUserId,
      name: "Duplicate Business",
      description: "Duplicate business",
      category_id: "cat-1",
      verification_status: "unverified",
      phone: "5551234567",
      potential_duplicate_id: mockExistingBusinessId,
      created_at: mockDate,
      updated_at: mockDate,
    };

    // Mock findBusinessByPhone to return existing business (phone matches after normalization)
    businessRepo.findBusinessByPhone.mockResolvedValue(mockExistingBusiness);

    // Query for insert call
    mockQuery.mockResolvedValue({ rows: [mockNewBusiness] });

    const context = {
      user: {
        id: mockUserId,
        email: "owner@example.com",
      },
    };

    // Phone in different format but same number
    const args = {
      input: {
        name: "Duplicate Business",
        description: "Duplicate business",
        categoryId: "cat-1",
        phone: "+1 (555) 123-4567",
      },
    };

    const result = await createBusiness(null, args, context);

    expect(result.success).toBe(true);
    expect(result.isPotentialDuplicate).toBe(true);
    expect(result.existingBusinessId).toBe(mockExistingBusinessId);
  });
});
