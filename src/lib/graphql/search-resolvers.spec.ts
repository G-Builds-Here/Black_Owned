import { searchBusinesses } from './resolvers';

describe('searchBusinesses resolver', () => {
  it('returns all businesses when query is empty', () => {
    const result = searchBusinesses({}, { query: '', page: 1, pageSize: 10 });

    expect(result.businesses.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
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
});
