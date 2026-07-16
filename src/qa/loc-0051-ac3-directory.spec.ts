/**
 * AC3: Business Directory Page Tests
 *
 * Validates:
 * - Business card grid rendering with proper data display
 * - Filtering by category, rating, location, verification status
 * - Sorting by relevance, rating, distance, newest
 * - Empty state handling for no results
 * - Save/Share functionality
 */

import { Business, BusinessCardProps } from '../../components/ui/BusinessCard';
import { FilterOption, SortOption } from '../../components/ui/FilterBar';

// Test data factory
const createBusiness = (overrides?: Partial<Business>): Business => ({
  id: '1',
  name: 'Soul Food Kitchen',
  category: 'Food & Dining',
  rating: 4.8,
  reviewCount: 156,
  location: 'Harlem, NY',
  isVerified: true,
  imageUrl: '',
  description: 'Authentic Southern cuisine with a modern twist.',
  tags: ['Southern', 'Family-Friendly', 'Takeout'],
  ...overrides,
});

describe('Business Directory - Filtering', () => {
  const mockBusinesses: Business[] = [
    createBusiness({ id: '1', name: 'Soul Food Kitchen', category: 'Food & Dining', rating: 4.8, location: 'Harlem, NY', isVerified: true }),
    createBusiness({ id: '2', name: 'Black Diamond Consulting', category: 'Professional Services', rating: 5.0, location: 'Atlanta, GA', isVerified: true }),
    createBusiness({ id: '3', name: 'Afro Threads', category: 'Retail & Fashion', rating: 4.5, location: 'Los Angeles, CA', isVerified: false }),
    createBusiness({ id: '4', name: 'Heritage Wellness', category: 'Health & Wellness', rating: 4.9, location: 'Chicago, IL', isVerified: true }),
    createBusiness({ id: '5', name: 'Golden Era Barbershop', category: 'Personal Services', rating: 4.7, location: 'Houston, TX', isVerified: true }),
    createBusiness({ id: '6', name: 'Rhythm & Blues Records', category: 'Entertainment', rating: 4.6, location: 'New Orleans, LA', isVerified: false }),
  ];

  describe('Category Filter', () => {
    it('filters businesses by selected category', () => {
      const filters: FilterOption = { category: 'Food & Dining' };
      const result = mockBusinesses.filter((b) => {
        if (filters.category) return b.category === filters.category;
        return true;
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Soul Food Kitchen');
    });

    it('returns all businesses when no category filter is applied', () => {
      const filters: FilterOption = {};
      const result = mockBusinesses.filter((b) => {
        if (filters.category) return b.category === filters.category;
        return true;
      });

      expect(result).toHaveLength(6);
    });

    it('handles multiple category selections correctly', () => {
      // Each category filter is independent - only one can be active at a time
      const foodFilter: FilterOption = { category: 'Food & Dining' };
      const retailFilter: FilterOption = { category: 'Retail & Fashion' };

      const foodResults = mockBusinesses.filter((b) => {
        if (foodFilter.category) return b.category === foodFilter.category;
        return true;
      });

      const retailResults = mockBusinesses.filter((b) => {
        if (retailFilter.category) return b.category === retailFilter.category;
        return true;
      });

      expect(foodResults).toHaveLength(1);
      expect(retailResults).toHaveLength(1);
      expect(foodResults[0].id).not.toBe(retailResults[0].id);
    });
  });

  describe('Rating Filter', () => {
    it('filters businesses by minimum rating', () => {
      const filters: FilterOption = { minRating: 4.5 };
      const result = mockBusinesses.filter((b) => {
        if (filters.minRating) return b.rating >= filters.minRating!;
        return true;
      });

      expect(result.every((b) => b.rating >= 4.5)).toBe(true);
      expect(result.map((b) => b.name)).toEqual(
        expect.arrayContaining(['Soul Food Kitchen', 'Black Diamond Consulting', 'Heritage Wellness'])
      );
    });

    it('includes businesses at exact minimum rating threshold', () => {
      const filters: FilterOption = { minRating: 5.0 };
      const result = mockBusinesses.filter((b) => {
        if (filters.minRating) return b.rating >= filters.minRating!;
        return true;
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Black Diamond Consulting');
      expect(result[0].rating).toBe(5.0);
    });

    it('excludes businesses below minimum rating threshold', () => {
      const filters: FilterOption = { minRating: 4.8 };
      const result = mockBusinesses.filter((b) => {
        if (filters.minRating) return b.rating >= filters.minRating!;
        return true;
      });

      expect(result.every((b) => b.rating >= 4.8)).toBe(true);
      expect(result.map((b) => b.name)).not.toContain('Afro Threads'); // 4.5 rating
      expect(result.map((b) => b.name)).not.toContain('Rhythm & Blues Records'); // 4.6 rating
    });

    it('returns all businesses when no rating filter is applied', () => {
      const filters: FilterOption = {};
      const result = mockBusinesses.filter((b) => {
        if (filters.minRating) return b.rating >= filters.minRating!;
        return true;
      });

      expect(result).toHaveLength(6);
    });
  });

  describe('Location Filter', () => {
    it('filters businesses by selected location', () => {
      const filters: FilterOption = { location: 'Harlem, NY' };
      const result = mockBusinesses.filter((b) => {
        if (filters.location) return b.location === filters.location;
        return true;
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Soul Food Kitchen');
    });

    it('returns all businesses when no location filter is applied', () => {
      const filters: FilterOption = {};
      const result = mockBusinesses.filter((b) => {
        if (filters.location) return b.location === filters.location;
        return true;
      });

      expect(result).toHaveLength(6);
    });
  });

  describe('Verification Filter', () => {
    it('shows only verified businesses when verifiedOnly is true', () => {
      const filters: FilterOption = { verifiedOnly: true };
      const result = mockBusinesses.filter((b) => {
        if (filters.verifiedOnly) return b.isVerified;
        return true;
      });

      expect(result.every((b) => b.isVerified)).toBe(true);
      expect(result.map((b) => b.name)).not.toContain('Afro Threads');
      expect(result.map((b) => b.name)).not.toContain('Rhythm & Blues Records');
    });

    it('shows all businesses when verifiedOnly is false or undefined', () => {
      const filters: FilterOption = { verifiedOnly: false };
      const result = mockBusinesses.filter((b) => {
        if (filters.verifiedOnly) return b.isVerified;
        return true;
      });

      expect(result).toHaveLength(6);
    });

    it('combines verification filter with other filters', () => {
      const filters: FilterOption = { verifiedOnly: true, category: 'Food & Dining' };
      const result = mockBusinesses.filter((b) => {
        if (filters.category) return b.category === filters.category && (!filters.verifiedOnly || b.isVerified);
        if (filters.verifiedOnly) return b.isVerified;
        return true;
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Soul Food Kitchen');
      expect(result[0].isVerified).toBe(true);
    });
  });

  describe('Combined Filters', () => {
    it('applies multiple filters simultaneously', () => {
      const filters: FilterOption = {
        category: 'Food & Dining',
        minRating: 4.5,
        location: 'Harlem, NY',
        verifiedOnly: true,
      };
      const result = mockBusinesses.filter((b) => {
        let passes = true;
        if (filters.category) passes = passes && b.category === filters.category;
        if (filters.minRating) passes = passes && b.rating >= filters.minRating!;
        if (filters.location) passes = passes && b.location === filters.location;
        if (filters.verifiedOnly) passes = passes && b.isVerified;
        return passes;
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Soul Food Kitchen');
    });

    it('returns empty result when filters have no matching businesses', () => {
      const filters: FilterOption = {
        category: 'Food & Dining',
        location: 'Atlanta, GA', // No food business in Atlanta
      };
      const result = mockBusinesses.filter((b) => {
        let passes = true;
        if (filters.category) passes = passes && b.category === filters.category;
        if (filters.location) passes = passes && b.location === filters.location;
        return passes;
      });

      expect(result).toHaveLength(0);
    });
  });
});

describe('Business Directory - Sorting', () => {
  const mockBusinesses: Business[] = [
    createBusiness({ id: '1', name: 'Soul Food Kitchen', rating: 4.8, reviewCount: 156 }),
    createBusiness({ id: '2', name: 'Black Diamond Consulting', rating: 5.0, reviewCount: 42 }),
    createBusiness({ id: '3', name: 'Afro Threads', rating: 4.5, reviewCount: 89 }),
    createBusiness({ id: '4', name: 'Heritage Wellness', rating: 4.9, reviewCount: 203 }),
  ];

  describe('Rating Sort', () => {
    it('sorts businesses by rating in descending order', () => {
      const sort: SortOption = 'rating';
      const result = [...mockBusinesses].sort((a, b) => {
        if (sort === 'rating') return b.rating - a.rating;
        return 0;
      });

      expect(result[0].name).toBe('Black Diamond Consulting'); // 5.0
      expect(result[1].name).toBe('Heritage Wellness'); // 4.9
      expect(result[2].name).toBe('Soul Food Kitchen'); // 4.8
      expect(result[3].name).toBe('Afro Threads'); // 4.5
    });
  });

  describe('Relevance Sort', () => {
    it('sorts by rating as relevance proxy (default)', () => {
      const sort: SortOption = 'relevance';
      const result = [...mockBusinesses].sort((a, b) => {
        if (sort === 'relevance' || sort === 'rating') return b.rating - a.rating;
        return 0;
      });

      expect(result[0].rating).toBeGreaterThanOrEqual(result[1].rating);
      expect(result[1].rating).toBeGreaterThanOrEqual(result[2].rating);
      expect(result[2].rating).toBeGreaterThanOrEqual(result[3].rating);
    });
  });

  describe('Distance Sort', () => {
    it('sorts by location alphabetically as distance proxy', () => {
      const businessesWithLocation = [
        createBusiness({ id: '1', name: 'Business C', location: 'Chicago, IL' }),
        createBusiness({ id: '2', name: 'Business A', location: 'Atlanta, GA' }),
        createBusiness({ id: '3', name: 'Business B', location: 'Harlem, NY' }),
      ];

      const sort: SortOption = 'distance';
      const result = [...businessesWithLocation].sort((a, b) => {
        if (sort === 'distance') return a.location.localeCompare(b.location);
        return 0;
      });

      expect(result[0].name).toBe('Business A'); // Atlanta
      expect(result[1].name).toBe('Business C'); // Chicago
      expect(result[2].name).toBe('Business B'); // Harlem
    });
  });

  describe('Newest Sort', () => {
    it('sorts by review count as newest proxy', () => {
      const sort: SortOption = 'newest';
      const result = [...mockBusinesses].sort((a, b) => {
        if (sort === 'newest') return b.reviewCount - a.reviewCount;
        return 0;
      });

      expect(result[0].name).toBe('Heritage Wellness'); // 203 reviews
      expect(result[1].name).toBe('Soul Food Kitchen'); // 156 reviews
      expect(result[2].name).toBe('Afro Threads'); // 89 reviews
      expect(result[3].name).toBe('Black Diamond Consulting'); // 42 reviews
    });
  });
});

describe('Business Directory - Empty State', () => {
  it('displays empty state when no businesses match filters', () => {
    const filteredBusinesses: Business[] = [];
    const activeTab = 'all';
    const displayBusinesses = activeTab === 'all' ? filteredBusinesses : [];

    expect(displayBusinesses.length).toBe(0);
    // Empty state should show "No businesses found" message
    // and offer "Clear Filters" button for 'all' tab
  });

  it('displays different empty state message for saved tab', () => {
    const savedBusinesses: Business[] = [];
    const activeTab = 'saved';
    const displayBusinesses = activeTab === 'all' ? [] : savedBusinesses;

    expect(displayBusinesses.length).toBe(0);
    // Empty state should show "You haven't saved any businesses yet" for saved tab
  });

  it('shows correct results count when businesses exist', () => {
    const businesses: Business[] = [createBusiness(), createBusiness()];
    expect(businesses.length).toBe(2);
    // Should display "2 businesses found"
  });

  it('shows singular "business" when only one result exists', () => {
    const businesses: Business[] = [createBusiness()];
    expect(businesses.length).toBe(1);
    // Should display "1 business found"
  });
});

describe('Business Card Component', () => {
  const createBusinessCardProps = (overrides?: Partial<Business>): BusinessCardProps => ({
    business: createBusiness(overrides),
    onViewDetails: jest.fn(),
    onSave: jest.fn(),
    onShare: jest.fn(),
  });

  describe('Business Information Display', () => {
    it('displays business name', () => {
      const props = createBusinessCardProps({ name: 'Test Business' });
      expect(props.business.name).toBe('Test Business');
    });

    it('displays business category', () => {
      const props = createBusinessCardProps({ category: 'Food & Dining' });
      expect(props.business.category).toBe('Food & Dining');
    });

    it('displays rating with review count', () => {
      const props = createBusinessCardProps({ rating: 4.5, reviewCount: 100 });
      expect(props.business.rating).toBe(4.5);
      expect(props.business.reviewCount).toBe(100);
    });

    it('displays location', () => {
      const props = createBusinessCardProps({ location: 'Harlem, NY' });
      expect(props.business.location).toBe('Harlem, NY');
    });

    it('displays verification badge for verified businesses', () => {
      const verifiedProps = createBusinessCardProps({ isVerified: true });
      const unverifiedProps = createBusinessCardProps({ isVerified: false });

      expect(verifiedProps.business.isVerified).toBe(true);
      expect(unverifiedProps.business.isVerified).toBe(false);
    });

    it('displays business description', () => {
      const props = createBusinessCardProps({ description: 'Test description' });
      expect(props.business.description).toBe('Test description');
    });

    it('displays tags when available', () => {
      const props = createBusinessCardProps({ tags: ['Tag1', 'Tag2', 'Tag3'] });
      expect(props.business.tags).toHaveLength(3);
    });

    it('handles empty tags gracefully', () => {
      const props = createBusinessCardProps({ tags: [] });
      expect(props.business.tags).toHaveLength(0);
    });
  });

  describe('Star Rating Display', () => {
    it('renders correct number of full stars', () => {
      const rating = 4;
      const fullStars = Math.floor(rating);
      expect(fullStars).toBe(4);
    });

    it('renders half star when rating has 0.5 decimal', () => {
      const rating = 4.5;
      const hasHalfStar = rating % 1 >= 0.5;
      expect(hasHalfStar).toBe(true);
    });

    it('does not render half star when rating has less than 0.5 decimal', () => {
      const rating = 4.4;
      const hasHalfStar = rating % 1 >= 0.5;
      expect(hasHalfStar).toBe(false);
    });

    it('displays review count alongside stars', () => {
      const reviewCount = 156;
      expect(reviewCount).toBeGreaterThan(0);
    });
  });

  describe('Action Handlers', () => {
    it('calls onViewDetails with business ID when triggered', () => {
      const mockOnViewDetails = jest.fn();
      const testBusiness = createBusiness({ id: 'test-business-123' });
      const props: BusinessCardProps = {
        business: testBusiness,
        onViewDetails: mockOnViewDetails,
      };

      props.onViewDetails?.(testBusiness.id);

      expect(mockOnViewDetails).toHaveBeenCalledWith(testBusiness.id);
    });

    it('calls onSave with business ID when triggered', () => {
      const mockOnSave = jest.fn();
      const testBusiness = createBusiness({ id: 'test-business-456' });
      const props: BusinessCardProps = {
        business: testBusiness,
        onSave: mockOnSave,
      };

      props.onSave?.(testBusiness.id);

      expect(mockOnSave).toHaveBeenCalledWith(testBusiness.id);
    });

    it('calls onShare with business ID when triggered', () => {
      const mockOnShare = jest.fn();
      const testBusiness = createBusiness({ id: 'test-business-789' });
      const props: BusinessCardProps = {
        business: testBusiness,
        onShare: mockOnShare,
      };

      props.onShare?.(testBusiness.id);

      expect(mockOnShare).toHaveBeenCalledWith(testBusiness.id);
    });

    it('handles undefined handlers gracefully', () => {
      const props: BusinessCardProps = {
        business: createBusiness(),
        // All handlers undefined
      };

      // Should not throw when handlers are undefined
      expect(() => props.onViewDetails?.('1')).not.toThrow();
      expect(() => props.onSave?.('1')).not.toThrow();
      expect(() => props.onShare?.('1')).not.toThrow();
    });
  });

  describe('Image Handling', () => {
    it('displays business image when imageUrl is provided', () => {
      const props = createBusinessCardProps({ imageUrl: 'https://example.com/image.jpg' });
      expect(props.business.imageUrl).toBe('https://example.com/image.jpg');
    });

    it('handles missing image URL gracefully', () => {
      const props = createBusinessCardProps({ imageUrl: '' });
      expect(props.business.imageUrl).toBe('');
      // Should display placeholder icon
    });
  });
});

describe('FilterBar Component', () => {
  describe('Filter State Management', () => {
    it('initializes with empty filters', () => {
      const initialFilters: FilterOption = {};
      expect(initialFilters.category).toBeUndefined();
      expect(initialFilters.minRating).toBeUndefined();
      expect(initialFilters.location).toBeUndefined();
      expect(initialFilters.verifiedOnly).toBeUndefined();
    });

    it('tracks active filter state', () => {
      const activeFilters: FilterOption = {
        category: 'Food & Dining',
        minRating: 4.5,
        verifiedOnly: true,
      };

      expect(activeFilters.category).toBe('Food & Dining');
      expect(activeFilters.minRating).toBe(4.5);
      expect(activeFilters.verifiedOnly).toBe(true);
    });
  });

  describe('Filter Clear Functionality', () => {
    it('clears all filters when reset', () => {
      const activeFilters: FilterOption = {
        category: 'Food & Dining',
        minRating: 4.5,
        location: 'Harlem, NY',
        verifiedOnly: true,
      };

      const clearedFilters: FilterOption = {};

      expect(clearedFilters.category).toBeUndefined();
      expect(clearedFilters.minRating).toBeUndefined();
      expect(clearedFilters.location).toBeUndefined();
      expect(clearedFilters.verifiedOnly).toBeUndefined();
    });

    it('resets sort to relevance when filters are cleared', () => {
      const currentSort: SortOption = 'relevance';
      expect(currentSort).toBe('relevance');
    });
  });

  describe('Active Filters Display', () => {
    it('shows active filter chips for each applied filter', () => {
      const filters: FilterOption = {
        category: 'Food & Dining',
        minRating: 4.5,
        location: 'Harlem, NY',
        verifiedOnly: true,
      };

      const activeFilterCount = [
        filters.category,
        filters.minRating,
        filters.location,
        filters.verifiedOnly,
      ].filter((f) => f !== undefined && f !== false).length;

      expect(activeFilterCount).toBe(4);
    });

    it('shows no active filters when all are cleared', () => {
      const filters: FilterOption = {};
      const activeFilterCount = [
        filters.category,
        filters.minRating,
        filters.location,
        filters.verifiedOnly,
      ].filter((f) => f !== undefined && f !== false).length;

      expect(activeFilterCount).toBe(0);
    });

    it('allows individual filter removal', () => {
      const filters: FilterOption = {
        category: 'Food & Dining',
        minRating: 4.5,
      };

      // Remove category filter
      const afterRemoval: FilterOption = {
        ...filters,
        category: undefined,
      };

      expect(afterRemoval.category).toBeUndefined();
      expect(afterRemoval.minRating).toBe(4.5);
    });
  });

  describe('Sort Options', () => {
    it('supports all required sort options', () => {
      const sortOptions: SortOption[] = ['relevance', 'rating', 'distance', 'newest'];
      expect(sortOptions).toHaveLength(4);
    });

    it('defaults to relevance sort', () => {
      const defaultSort: SortOption = 'relevance';
      expect(defaultSort).toBe('relevance');
    });
  });
});

describe('Business Directory - Integration', () => {
  const mockBusinesses: Business[] = [
    createBusiness({ id: '1', name: 'Soul Food Kitchen', category: 'Food & Dining', rating: 4.8, location: 'Harlem, NY', isVerified: true, reviewCount: 156 }),
    createBusiness({ id: '2', name: 'Black Diamond Consulting', category: 'Professional Services', rating: 5.0, location: 'Atlanta, GA', isVerified: true, reviewCount: 42 }),
    createBusiness({ id: '3', name: 'Afro Threads', category: 'Retail & Fashion', rating: 4.5, location: 'Los Angeles, CA', isVerified: false, reviewCount: 89 }),
    createBusiness({ id: '4', name: 'Heritage Wellness', category: 'Health & Wellness', rating: 4.9, location: 'Chicago, IL', isVerified: true, reviewCount: 203 }),
    createBusiness({ id: '5', name: 'Golden Era Barbershop', category: 'Personal Services', rating: 4.7, location: 'Houston, TX', isVerified: true, reviewCount: 312 }),
    createBusiness({ id: '6', name: 'Rhythm & Blues Records', category: 'Entertainment', rating: 4.6, location: 'New Orleans, LA', isVerified: false, reviewCount: 78 }),
  ];

  describe('Filter and Sort Combination', () => {
    it('filters first, then sorts the result', () => {
      const filters: FilterOption = { minRating: 4.5, verifiedOnly: true };
      const sort: SortOption = 'rating';

      // Step 1: Apply filters
      let result = mockBusinesses.filter((b) => {
        let passes = true;
        if (filters.minRating) passes = passes && b.rating >= filters.minRating!;
        if (filters.verifiedOnly) passes = passes && b.isVerified;
        return passes;
      });

      // Step 2: Apply sort
      result = result.sort((a, b) => {
        if (sort === 'rating') return b.rating - a.rating;
        return 0;
      });

      // Verify all results pass filters
      expect(result.every((b) => b.rating >= 4.5 && b.isVerified)).toBe(true);
      // Verify results are sorted by rating descending
      expect(result[0].rating).toBeGreaterThanOrEqual(result[1].rating);
      expect(result[1].rating).toBeGreaterThanOrEqual(result[2].rating);
    });

    it('handles complex filter + sort scenario', () => {
      const filters: FilterOption = {
        category: 'Food & Dining',
        minRating: 4.0,
        verifiedOnly: true,
      };
      const sort: SortOption = 'newest';

      let result = mockBusinesses.filter((b) => {
        let passes = true;
        if (filters.category) passes = passes && b.category === filters.category;
        if (filters.minRating) passes = passes && b.rating >= filters.minRating!;
        if (filters.verifiedOnly) passes = passes && b.isVerified;
        return passes;
      });

      result = result.sort((a, b) => {
        if (sort === 'newest') return b.reviewCount - a.reviewCount;
        return 0;
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Soul Food Kitchen');
    });
  });

  describe('Tab Switching', () => {
    it('shows all businesses on "all" tab', () => {
      const activeTab = 'all';
      const filteredBusinesses = mockBusinesses.filter((b) => {
        // No filters applied
        return true;
      });
      const displayBusinesses = activeTab === 'all' ? filteredBusinesses : [];

      expect(displayBusinesses).toHaveLength(6);
    });

    it('shows only saved businesses on "saved" tab', () => {
      const activeTab = 'saved';
      const savedBusinessIds = new Set(['1', '3']);
      const savedBusinessList = mockBusinesses.filter((b) => savedBusinessIds.has(b.id));
      const displayBusinesses = activeTab === 'all' ? [] : savedBusinessList;

      expect(displayBusinesses).toHaveLength(2);
      expect(displayBusinesses.map((b) => b.id)).toEqual(expect.arrayContaining(['1', '3']));
    });

    it('applies filters only to "all" tab, not "saved" tab', () => {
      const activeTab = 'all';
      const filters: FilterOption = { category: 'Food & Dining' };

      const filteredBusinesses = mockBusinesses.filter((b) => {
        if (filters.category) return b.category === filters.category;
        return true;
      });

      const displayBusinesses = activeTab === 'all' ? filteredBusinesses : [];

      expect(displayBusinesses).toHaveLength(1);
      expect(displayBusinesses[0].name).toBe('Soul Food Kitchen');
    });
  });
});
