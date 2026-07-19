/**
 * Unit tests for GraphQL client
 */

import { fetchBusinessById, graphqlQuery, Business } from './graphql-client';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
});

describe('GraphQL Client', () => {
  describe('graphqlQuery', () => {
    it('sends correct request format', async () => {
      const mockResponse = {
        data: { result: 'test' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await graphqlQuery('{ test }', { id: '123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs?.body as string);
      expect(body.query).toBe('{ test }');
      expect(body.variables).toEqual({ id: '123' });
    });

    it('returns data on successful response', async () => {
      const mockData = { result: 'success' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockData }),
      });

      const result = await graphqlQuery<{ result: string }>(
        '{ test }',
        {}
      );

      expect(result).toEqual(mockData);
    });

    it('throws error on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        graphqlQuery('{ test }', {})
      ).rejects.toThrow('GraphQL request failed: 500 Internal Server Error');
    });

    it('throws error when GraphQL returns errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Field "invalid" does not exist' }],
        }),
      });

      await expect(
        graphqlQuery('{ invalid }', {})
      ).rejects.toThrow('GraphQL error: Field "invalid" does not exist');
    });

    it('throws error when no data is returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: null }),
      });

      await expect(
        graphqlQuery('{ test }', {})
      ).rejects.toThrow('No data returned from GraphQL query');
    });
  });

  describe('fetchBusinessById', () => {
    it('fetches business by ID correctly', async () => {
      const mockBusiness: Business = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Business',
        categoryId: 'food-dining',
        verified: true,
        createdAt: {
          timestamp: 1704067200,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            business: mockBusiness,
          },
        }),
      });

      const result = await fetchBusinessById('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toEqual(mockBusiness);

      // Verify the query structure
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs?.body as string);
      expect(body.query).toContain('query GetBusiness');
      expect(body.query).toContain('business(id: $id)');
      expect(body.variables).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('returns null when business is not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            business: null,
          },
        }),
      });

      const result = await fetchBusinessById('non-existent-id');

      expect(result).toBeNull();
    });

    it('throws error when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        fetchBusinessById('non-existent-id')
      ).rejects.toThrow('GraphQL request failed: 404 Not Found');
    });

    it('uses environment variable for API URL', async () => {
      const originalEnv = process.env.NEXT_PUBLIC_API_URL;
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

      const mockBusiness: Business = {
        id: 'test-id',
        name: 'Test',
        categoryId: 'test',
        verified: false,
        createdAt: { timestamp: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { business: mockBusiness },
        }),
      });

      await fetchBusinessById('test-id');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/graphql',
        expect.any(Object)
      );

      // Restore
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    });

    it('uses default URL when env var is not set', async () => {
      const originalEnv = process.env.NEXT_PUBLIC_API_URL;
      delete process.env.NEXT_PUBLIC_API_URL;

      const mockBusiness: Business = {
        id: 'test-id',
        name: 'Test',
        categoryId: 'test',
        verified: false,
        createdAt: { timestamp: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { business: mockBusiness },
        }),
      });

      await fetchBusinessById('test-id');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/graphql',
        expect.any(Object)
      );

      // Restore
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    });
  });
});
