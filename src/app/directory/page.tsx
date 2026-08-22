'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import BusinessCard, { Business } from '@/components/ui/BusinessCard';
import FilterBar, { FilterOption, SortOption } from '@/components/ui/FilterBar';
import { Navigation } from '@/components/ui/Navigation';

/**
 * Shape of a /api/directory business item
 */
interface DirectoryBusiness {
  id: string;
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  location: string;
  isVerified: boolean;
  description: string | null;
  website: string | null;
  phone: string | null;
  source: string | null;
  createdAt: string;
}

interface DirectoryFacets {
  categories: string[];
  locations: string[];
}

/**
 * Derive a neighborhood/city ("Harlem, NY") from a full street address.
 * Matches the server-side deriveLocation used for location facets.
 */
function deriveLocation(address: string): string {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return address;
  return parts.slice(-2).join(', ');
}

/**
 * Map a directory item to the BusinessCard shape
 */
function toCardBusiness(item: DirectoryBusiness): Business {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    rating: item.rating ?? 0,
    reviewCount: item.reviewCount ?? 0,
    location: item.location,
    isVerified: item.isVerified,
    imageUrl: '',
    description: item.description || (item.website ? `Website: ${item.website}` : ''),
    tags: [],
  };
}

/**
 * Sort directory items by the active sort option
 */
function sortDirectory(items: DirectoryBusiness[], sort: SortOption): DirectoryBusiness[] {
  const result = [...items];
  switch (sort) {
    case 'rating':
      result.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      break;
    case 'distance':
      result.sort((a, b) => a.location.localeCompare(b.location));
      break;
    case 'newest':
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case 'relevance':
    default:
      result.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
      break;
  }
  return result;
}

function DirectoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');
  // Seed filters from the URL so shared links restore the active filters
  const [filters, setFilters] = useState<FilterOption>(() => {
    const next: FilterOption = {};
    const category = searchParams.get('category');
    const location = searchParams.get('location');
    const minRatingRaw = searchParams.get('minRating');
    const verifiedOnly = searchParams.get('verifiedOnly');
    if (category) next.category = category;
    if (location) next.location = location;
    if (minRatingRaw && !Number.isNaN(Number(minRatingRaw))) {
      next.minRating = Number(minRatingRaw);
    }
    if (verifiedOnly === 'true') next.verifiedOnly = true;
    return next;
  });
  const [sort, setSort] = useState<SortOption>('relevance');
  const [savedBusinesses, setSavedBusinesses] = useState<Set<string>>(new Set());
  const [showMap, setShowMap] = useState(true);
  const [directory, setDirectory] = useState<DirectoryBusiness[]>([]);
  const [facets, setFacets] = useState<DirectoryFacets>({ categories: [], locations: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/directory');
      const data = await response.json();
      if (response.ok && data.success) {
        setDirectory(data.data.businesses);
        setFacets(data.data.facets);
      } else {
        setLoadError('Failed to load the directory');
      }
    } catch (error) {
      console.error('Failed to load directory:', error);
      setLoadError('Failed to load the directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  // Write filters back to the URL so the current view is shareable and
  // survives a reload. Uses replace (not push) so filter tweaks don't pile
  // up history entries.
  const handleFilterChange = (newFilters: FilterOption) => {
    setFilters(newFilters);

    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string | null) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };
    setOrDelete('category', newFilters.category ?? null);
    setOrDelete('location', newFilters.location ?? null);
    setOrDelete('minRating', newFilters.minRating ? String(newFilters.minRating) : null);
    setOrDelete('verifiedOnly', newFilters.verifiedOnly ? 'true' : null);

    const query = params.toString();
    router.replace(query ? `/directory?${query}` : '/directory', { scroll: false });
  };

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
  };

  const handleViewDetails = (businessId: string) => {
    console.log('View details:', businessId);
    // Navigation is handled by the card link (enableLink)
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
    const business = directory.find((b) => b.id === businessId);
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
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(`${window.location.href}?business=${businessId}`);
      alert('Link copied to clipboard!');
    }
  };

  // Apply filters to the fetched directory
  const filteredDirectory = useMemo(() => {
    let result = directory;

    if (filters.category) {
      result = result.filter((b) => b.category === filters.category);
    }
    if (filters.location) {
      result = result.filter((b) => deriveLocation(b.location) === filters.location);
    }
    if (filters.minRating) {
      result = result.filter((b) => b.rating !== null && b.rating >= filters.minRating!);
    }
    if (filters.verifiedOnly) {
      result = result.filter((b) => b.isVerified);
    }

    return result;
  }, [directory, filters]);

  const sortedDirectory = useMemo(
    () => sortDirectory(filteredDirectory, sort),
    [filteredDirectory, sort]
  );

  const savedDirectory = useMemo(
    () => directory.filter((b) => savedBusinesses.has(b.id)),
    [directory, savedBusinesses]
  );

  const displayBusinesses: Business[] =
    activeTab === 'all'
      ? sortedDirectory.map(toCardBusiness)
      : savedDirectory.map(toCardBusiness);

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Page Header */}
      <section className="bg-gradient-to-br from-[#E31C25] via-black to-[#009B3F] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">Business Directory</h1>
          <p className="text-xl text-neutral-100 max-w-3xl">
            Discover Black-owned businesses in your area. Filter by category, rating, and location
            to find exactly what you need.
          </p>
        </div>
      </section>

      {/* Main Content - Split View */}
      <section className="flex h-[calc(100vh-140px)] overflow-hidden max-w-full">
        {/* Business List - Left Side */}
        <div className={`${showMap ? 'lg:w-[40%]' : 'w-full'} overflow-y-auto`}>
          <div className="p-4 space-y-4">
            {/* Filter Bar with Tabs */}
            <FilterBar
              categories={facets.categories}
              locations={facets.locations}
              onFilterChange={handleFilterChange}
              onSortChange={handleSortChange}
              currentSort={sort}
              currentFilters={filters}
              savedCount={savedBusinesses.size}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              filteredCount={sortedDirectory.length}
            />

            {/* Business List - Horizontal Cards */}
            {loading ? (
              <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-neutral-200">
                <div className="text-neutral-500">Loading businesses...</div>
              </div>
            ) : loadError && directory.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-neutral-200">
                <div className="text-6xl mb-4">⚠️</div>
                <h3 className="text-2xl font-semibold text-neutral-800 mb-2">{loadError}</h3>
                <p className="text-neutral-600 mb-6">Please try again in a moment.</p>
                <button
                  onClick={fetchDirectory}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-heritage-ochre text-white rounded-lg hover:bg-heritage-ochre/90 transition-colors"
                >
                  Retry
                </button>
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
              <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-neutral-200">
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
                      handleFilterChange({});
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

        {/* Map Panel - Right Side */}
        {showMap && (
          <div className="hidden lg:block flex-1 h-full border-l border-neutral-200 bg-neutral-100 relative">
            {/* Map Toggle Button */}
            <button
              onClick={() => setShowMap(false)}
              className="absolute top-4 right-4 z-10 bg-white px-3 py-2 rounded-lg shadow-md text-sm font-medium hover:bg-neutral-50"
            >
              Hide Map ×
            </button>
            {/* Placeholder Map */}
            <div className="w-full h-full flex items-center justify-center text-neutral-400">
              <div className="text-center">
                <div className="text-6xl mb-4">🗺️</div>
                <p className="text-lg font-medium">Map View</p>
                <p className="text-sm mt-2">Business locations will appear here</p>
                {displayBusinesses.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {displayBusinesses.map((b) => (
                      <div key={b.id} className="bg-white px-3 py-1 rounded-full text-sm shadow-sm">
                        {b.location || b.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Show Map Button (when hidden) */}
        {!showMap && (
          <button
            onClick={() => setShowMap(true)}
            className="absolute bottom-8 right-8 z-10 bg-heritage-ochre text-white px-4 py-2 rounded-lg shadow-lg hover:bg-heritage-ochre/90"
          >
            Show Map
          </button>
        )}
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-neutral-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h4 className="text-white font-semibold mb-4">Black Owned</h4>
              <p className="text-sm">
                Celebrating and supporting Black-owned businesses across the nation.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Explore</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/directory" className="hover:text-white">Businesses</a></li>
                <li><a href="/about" className="hover:text-white">About Us</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/help" className="hover:text-white">Help Center</a></li>
                <li><a href="/about" className="hover:text-white">Contact Us</a></li>
                <li><a href="/help#faq" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/privacy" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-sm">
            <p>&copy; 2026 Black Owned. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default function DirectoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <DirectoryContent />
    </Suspense>
  );
}
