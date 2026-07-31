'use client';

import React, { useState, useMemo, useEffect } from 'react';
import BusinessCard, { Business } from '@/components/ui/BusinessCard';
import FilterBar, { FilterOption, SortOption } from '@/components/ui/FilterBar';
import { Navigation } from '@/components/ui/Navigation';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const CATEGORIES = [
  'Food & Dining',
  'Professional Services',
  'Retail & Fashion',
  'Health & Wellness',
  'Personal Services',
  'Entertainment',
];

const LOCATIONS = [
  'Harlem, NY',
  'Atlanta, GA',
  'Los Angeles, CA',
  'Chicago, IL',
  'Houston, TX',
  'New Orleans, LA',
  'Washington, DC',
  'Philadelphia, PA',
];

export default function DirectoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');
  const [filters, setFilters] = useState<FilterOption>({});
  const [sort, setSort] = useState<SortOption>('relevance');
  const [savedBusinesses, setSavedBusinesses] = useState<Set<string>>(new Set());
  const [fetchedBusinesses, setFetchedBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);

  // Read URL params on mount and apply filters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    const categoryParam = params.get('category');
    const claimParam = params.get('claim');

    if (searchParam) {
      setFilters(prev => ({ ...prev, category: searchParam }));
    }
    if (categoryParam) {
      setFilters(prev => ({ ...prev, category: categoryParam }));
    }
    if (claimParam) {
      router.push('/business/claim');
    }
  }, []);

  useEffect(() => {
    const fetchBusinesses = async () => {
      console.log('[Directory] Fetching businesses from backend...');
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query Businesses($first: Int, $after: String) {
                businesses(first: $first, after: $after) {
                  edges {
                    cursor
                    node {
                      id
                      name
                      categoryId
                      verified
                      createdAt { timestamp }
                      description
                      ratingAvg
                      reviewCount
                      location
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            `,
            variables: { first: 100, after: null },
          }),
        });

        console.log('[Directory] Response status:', response.status);
        const json = await response.json();
        console.log('[Directory] Response:', json);

        if (json.errors) {
          console.error('[Directory] GraphQL errors:', json.errors);
        } else if (json.data?.businesses?.edges) {
          const edges = json.data.businesses.edges;
          console.log('[Directory] Received', edges.length, 'businesses');
          const businesses = edges.map((edge: any) => {
            const b = edge.node;
            return {
              id: b.id,
              name: b.name,
              category: formatCategory(b.categoryId),
              rating: b.ratingAvg || 0,
              reviewCount: b.reviewCount || 0,
              location: b.location || '',
              isVerified: b.verified,
              imageUrl: b.imageUrl || '',
              description: b.description || '',
              tags: b.tags || [],
            };
          });
          console.log('[Directory] Mapped businesses:', businesses);
          setFetchedBusinesses(businesses);
        }
      } catch (err) {
        console.error('[Directory] Failed to fetch businesses:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBusinesses();
  }, []);

  const formatCategory = (categoryId: string): string => {
    return categoryId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleFilterChange = (newFilters: FilterOption) => {
    setFilters(newFilters);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
  };

  const handleViewDetails = (businessId: string) => {
    router.push(`/business/${businessId}`);
  };

  const handleSave = (businessId: string) => {
    setSavedBusinesses((prev) => {
      const next = new Set(prev);
      if (next.has(businessId)) {
        next.delete(businessId);
      } else {
        next.add(businessId);
      }
      return next;
    });
  };

  const handleShare = async (businessId: string) => {
    const business = fetchedBusinesses.find((b) => b.id === businessId);
    if (business && navigator.share) {
      try {
        await navigator.share({
          title: business.name,
          text: `Check out ${business.name} on Black Owned`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      navigator.clipboard.writeText(`${window.location.href}?business=${businessId}`);
      alert('Link copied to clipboard!');
    }
  };

  const filteredBusinesses = useMemo(() => {
    let result = [...fetchedBusinesses];

    if (filters.category) {
      result = result.filter((b) => b.category === filters.category);
    }
    if (filters.location) {
      result = result.filter((b) => b.location === filters.location);
    }
    if (filters.minRating) {
      result = result.filter((b) => b.rating >= filters.minRating!);
    }
    if (filters.verifiedOnly) {
      result = result.filter((b) => b.isVerified);
    }

    switch (sort) {
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'distance':
        result.sort((a, b) => a.location.localeCompare(b.location));
        break;
      case 'newest':
        result.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case 'relevance':
      default:
        result.sort((a, b) => b.rating - a.rating);
        break;
    }

    return result;
  }, [filters, sort, fetchedBusinesses]);

  const savedBusinessList = useMemo(() => {
    return fetchedBusinesses.filter((b) => savedBusinesses.has(b.id));
  }, [savedBusinesses, fetchedBusinesses]);

  const displayBusinesses = activeTab === 'all' ? filteredBusinesses : savedBusinessList;

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Search & Filter Header */}
      <section className="bg-white border-b border-neutral-200 sticky top-16 z-40">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            {/* Search Input */}
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search businesses, categories, or locations..."
                  className="w-full px-4 py-2.5 pl-10 rounded-lg border border-neutral-300 focus:border-heritage-ochre focus:outline-none h-[46px]"
                  value={filters.category || ''}
                  onChange={(e) => handleFilterChange({ ...filters, category: e.target.value })}
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 flex-wrap">
              <FilterBar
                categories={CATEGORIES}
                locations={LOCATIONS}
                onFilterChange={handleFilterChange}
                onSortChange={handleSortChange}
                currentSort={sort}
                currentFilters={filters}
              />
            </div>

            {/* Map Toggle */}
            <div className="flex items-center">
              <button
                onClick={() => setShowMap(!showMap)}
                className="px-4 py-2.5 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:border-heritage-ochre transition-colors h-[46px]"
              >
                {showMap ? 'Hide Map' : 'Show Map'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content - Split View */}
      <section className="flex h-[calc(100vh-140px)] overflow-hidden">
        {/* Business List */}
        <div className={`overflow-y-auto bg-white ${showMap ? 'lg:w-[680px]' : 'w-full'}`}>
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            {/* Results Count */}
            <div className="mb-6 text-neutral-600">
              {displayBusinesses.length} {displayBusinesses.length === 1 ? 'business' : 'businesses'} found
            </div>

            {/* Business List */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-heritage-ochre border-t-transparent"></div>
              </div>
            ) : displayBusinesses.length > 0 ? (
              <div className="space-y-4">
                {displayBusinesses.map((business) => (
                  <BusinessCard
                    key={business.id}
                    business={business}
                    onViewDetails={handleViewDetails}
                    onSave={handleSave}
                    onShare={handleShare}
                    enableLink={true}
                  />
                ))}
              </div>
            ) : (
              /* Empty State */
              <div className="text-center py-16 bg-neutral-50 rounded-lg shadow-sm border border-neutral-200">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-2xl font-semibold text-neutral-800 mb-2">
                  No businesses found
                </h3>
                <p className="text-neutral-600 mb-6 max-w-md mx-auto">
                  {activeTab === 'saved'
                    ? "You haven't saved any businesses yet. Browse the directory and click the save button to build your list."
                    : 'Try adjusting your filters to find more businesses.'}
                </p>
                {activeTab === 'all' && (
                  <button
                    onClick={() => {
                      setFilters({});
                      setSort('relevance');
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-heritage-ochre text-white rounded-lg hover:bg-heritage-ochre/90 transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
                {activeTab === 'saved' && (
                  <button
                    onClick={() => setActiveTab('all')}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-heritage-ochre text-white rounded-lg hover:bg-heritage-ochre/90 transition-colors"
                  >
                    Browse Directory
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Map Panel */}
        {showMap && (
          <div className="hidden lg:flex flex-1 h-full bg-neutral-200 relative">
            {/* Map Placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">🗺️</div>
                <p className="text-neutral-600 text-lg">Map View</p>
                <p className="text-neutral-500 text-sm mt-2">
                  Map integration coming soon
                </p>
              </div>
            </div>

            {/* Business Pins (placeholder) */}
            {displayBusinesses.slice(0, 5).map((business, idx) => (
              <button
                key={business.id}
                className="absolute bg-heritage-ochre text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg hover:bg-heritage-terracotta transition-colors"
                style={{
                  left: `${20 + idx * 15}%`,
                  top: `${30 + idx * 10}%`,
                }}
                onClick={() => handleViewDetails(business.id)}
              >
                {business.name}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
