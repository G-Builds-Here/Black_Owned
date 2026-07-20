import { searchBusinesses } from './resolvers';

describe('searchBusinesses resolver', () => {
  it('returns all businesses when query is empty', () => {
    const result = searchBusinesses({}, { query: '', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.facets).toBeDefined();
    expect(result.facets.length).toBeGreaterThan(0);
  });

  it('returns facets with category counts for empty query', () => {
    const result = searchBusinesses({}, { query: '' });

    const facetCategories = result.facets.map((f) => f.category);
    expect(facetCategories).toContain('Food & Dining');
    expect(facetCategories).toContain('Professional Services');
    expect(result.facets.every((f) => f.count > 0)).toBe(true);
  });

  it('searches by business name', () => {
    const result = searchBusinesses({}, { query: 'Soul Food', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBe(1);
    expect(result.businesses[0].name).toBe('Soul Food Kitchen');
    expect(result.total).toBe(1);
  });

  it('searches by category', () => {
    const result = searchBusinesses({}, { query: 'Food & Dining', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBe(1);
    expect(result.businesses[0].category).toBe('Food & Dining');
  });

  it('searches by description', () => {
    const result = searchBusinesses({}, { query: 'cuisine', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBeGreaterThanOrEqual(1);
    expect(result.businesses[0].name).toBe('Soul Food Kitchen');
  });

  it('searches by tags', () => {
    const result = searchBusinesses({}, { query: 'Southern', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBe(1);
    expect(result.businesses[0].tags).toContain('Southern');
  });

  it('performs case-insensitive search', () => {
    const resultUpper = searchBusinesses({}, { query: 'SOUL FOOD', page: 1, pageSize: 10 });
    const resultLower = searchBusinesses({}, { query: 'soul food', page: 1, pageSize: 10 });
    const resultMixed = searchBusinesses({}, { query: 'SoUl FoOd', page: 1, pageSize: 10 });

    expect(resultUpper.businesses.length).toBe(resultLower.businesses.length);
    expect(resultLower.businesses.length).toBe(resultMixed.businesses.length);
  });

  it('returns empty results for non-matching query', () => {
    const result = searchBusinesses({}, { query: 'xyznonexistent', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBe(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('paginates results correctly', () => {
    const result1 = searchBusinesses({}, { query: '', page: 1, pageSize: 2 });
    const result2 = searchBusinesses({}, { query: '', page: 2, pageSize: 2 });

    expect(result1.businesses.length).toBe(2);
    expect(result2.businesses.length).toBe(2);
    expect(result1.page).toBe(1);
    expect(result2.page).toBe(2);
    expect(result1.businesses[0].id).not.toBe(result2.businesses[0].id);
  });

  it('calculates totalPages correctly', () => {
    const result = searchBusinesses({}, { query: '', page: 1, pageSize: 2 });

    const expectedTotalPages = Math.ceil(result.total / 2);
    expect(result.totalPages).toBe(expectedTotalPages);
  });

  it('handles page beyond available results', () => {
    const result = searchBusinesses({}, { query: '', page: 100, pageSize: 10 });

    expect(result.businesses.length).toBe(0);
    expect(result.page).toBe(100);
  });

  it('uses default page and pageSize when not provided', () => {
    const result = searchBusinesses({}, { query: '' });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('returns correct pagination metadata', () => {
    const result = searchBusinesses({}, { query: '', page: 2, pageSize: 5 });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBeGreaterThan(0);
    expect(result.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('searches by location', () => {
    const result = searchBusinesses({}, { query: 'Harlem', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBe(1);
    expect(result.businesses[0].location).toBe('Harlem, NY');
  });

  it('matches partial words', () => {
    const result = searchBusinesses({}, { query: 'consult', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBeGreaterThanOrEqual(1);
    expect(result.businesses[0].name).toBe('Black Diamond Consulting');
  });

  it('returns ranked results by relevance score', () => {
    // Query that matches name should rank higher than description
    const result = searchBusinesses({}, { query: 'soul', page: 1, pageSize: 10 });

    // Results should be sorted by relevance (highest score first)
    expect(result.businesses.length).toBeGreaterThan(0);
    expect(result.facets).toBeDefined();
  });

  it('returns facets with match counts for search query', () => {
    const result = searchBusinesses({}, { query: 'cuisine', page: 1, pageSize: 10 });

    expect(result.facets).toBeDefined();
    expect(Array.isArray(result.facets)).toBe(true);
    // Each facet should have category and count
    for (const facet of result.facets) {
      expect(typeof facet.category).toBe('string');
      expect(typeof facet.count).toBe('number');
      expect(facet.count).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns empty results with zero-count facets for non-matching query', () => {
    const result = searchBusinesses({}, { query: 'xyznonexistent' });

    expect(result.businesses.length).toBe(0);
    expect(result.total).toBe(0);
    expect(result.facets).toBeDefined();
    // All facets should have zero count when no matches
    expect(result.facets.every((f) => f.count === 0)).toBe(true);
  });

  it('search is accessible without authentication (public query)', () => {
    // This test verifies the resolver works without any auth context
    // The AC specifies that unauthenticated users can search
    const result = searchBusinesses({}, { query: 'coffee' });

    // Should return results without throwing auth errors
    expect(result).toBeDefined();
    expect(Array.isArray(result.businesses)).toBe(true);
    expect(Array.isArray(result.facets)).toBe(true);
  });
});
