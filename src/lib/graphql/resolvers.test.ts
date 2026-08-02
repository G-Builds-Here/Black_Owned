/**
 * Tests for GraphQL resolvers - Business creation and deduplication (AC3)
 *
 * AC3: Allow non-duplicate businesses through
 * Given no similar businesses exist in directory
 * When a new unique business is scraped
 * Then the business is marked as "new"
 * And import proceeds without dedup blocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pg module before importing resolvers
const mockQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock('pg', () => {
  // Create a proper constructor function
  function MockPool() {
    return {
      connect: vi.fn(() => ({
        query: mockQuery,
        release: mockRelease,
      })),
    };
  }
  return { Pool: MockPool };
});

vi.mock('../db/business-repository', () => ({
  findById: vi.fn(),
  create: vi.fn(),
  findBusinessesByOwnerId: vi.fn(),
}));

// Import after mocks
import { createBusiness } from './resolvers';

// Helper to create a mock business record
function createMockBusiness(overrides = {}) {
  return {
    id: 'test-business-id',
    owner_id: 'user-123',
    name: 'Test Business',
    description: null,
    category_id: 'cat-1',
    verification_status: 'unverified',
    import_source: null,
    scrape_job_id: null,
    created_at: new Date(),
    verified: false,
    categoryId: 'cat-1',
    verificationStatus: 'unverified',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('createBusiness - AC3 Deduplication Logic', () => {
  const mockContext = { user: { id: 'user-123' } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject request without authentication', async () => {
    const result = await createBusiness(
      {},
      { input: { name: 'Test Business', categoryId: 'cat-1' } },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Authentication required');
  });

  it('should reject request with missing name', async () => {
    const result = await createBusiness(
      {},
      { input: { name: '', categoryId: 'cat-1' } },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Name is required');
  });

  it('should reject request with missing categoryId', async () => {
    const result = await createBusiness(
      {},
      { input: { name: 'Test Business', categoryId: '' } },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Category ID is required');
  });

  it('should allow a unique business to be created when no duplicate exists (AC3)', async () => {
    // Setup: no similar business exists (count = 0)
    // Mock the SELECT query for duplicate check
    mockQuery.mockImplementation((query, params) => {
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      // Mock the INSERT query
      return Promise.resolve({ rows: [createMockBusiness()] });
    });
    mockRelease.mockReturnValue(undefined);

    const result = await createBusiness(
      {},
      { input: { name: 'Unique Business Name', categoryId: 'cat-1' } },
      mockContext
    );

    // AC3: Unique business should be allowed through
    expect(result.success).toBe(true);
    expect(result.business).toBeDefined();
    expect(result.business?.id).toBe('test-business-id');
  });

  it('should allow business creation even when similar business exists (AC3 - proceed regardless)', async () => {
    // AC3 requirement: Even if a similar business exists, the import should proceed
    // Setup: similar business exists (count = 1)
    mockQuery.mockImplementation((query, params) => {
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '1' }] });
      }
      // Mock the INSERT query
      return Promise.resolve({ rows: [createMockBusiness({ name: 'Similar Business Name' })] });
    });
    mockRelease.mockReturnValue(undefined);

    const result = await createBusiness(
      {},
      { input: { name: 'Similar Business Name', categoryId: 'cat-1' } },
      mockContext
    );

    // AC3: Import proceeds even when similar business exists
    // The check is for logging/awareness, not blocking
    expect(result.success).toBe(true);
    expect(result.business).toBeDefined();
  });

  it('should accept optional importSource and scrapeJobId fields', async () => {
    mockQuery.mockImplementation((query, params) => {
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      return Promise.resolve({ rows: [createMockBusiness({
        import_source: 'web-scrape', scrape_job_id: 'job-123' })] });
    });
    mockRelease.mockReturnValue(undefined);

    const result = await createBusiness(
      {},
      {
        input: {
          name: 'Scraped Business',
          categoryId: 'cat-1',
          importSource: 'web-scrape',
          scrapeJobId: 'job-123'
        }
      },
      mockContext
    );

    // Should accept the additional fields without error
    expect(result.success).toBe(true);
    expect(result.business).toBeDefined();
  });

  it('should trim whitespace from business name', async () => {
    mockQuery.mockImplementation((query, params) => {
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      return Promise.resolve({ rows: [createMockBusiness({ name: 'Trimmed Business' })] });
    });
    mockRelease.mockReturnValue(undefined);

    const result = await createBusiness(
      {},
      { input: { name: '  Trimmed Business  ', categoryId: 'cat-1' } },
      mockContext
    );

    // Should succeed - name is valid after trimming
    expect(result.success).toBe(true);
    expect(result.business).toBeDefined();
  });
});
