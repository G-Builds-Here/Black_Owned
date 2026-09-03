'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import BusinessCard, { Business } from '@/components/ui/BusinessCard';
import FilterBar, { FilterOption, SortOption } from '@/components/ui/FilterBar';
import { Navigation } from '@/components/ui/Navigation';
import dynamic from 'next/dynamic';
import type { MapPin } from '@/components/ui/MapView';

// MapView pulls in Leaflet, which touches `window` at module scope — load
// it client-only so server-side rendering of this page never evaluates it.
const MapView = dynamic(
  () => import('@/components/ui/MapView').then((m) => m.default),
  { ssr: false }
);

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
  imageUrl?: string | null;
  tags?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
  /**
   * Physical locations from business_locations (primary first). When
   * present the map pins one marker per location instead of the single
   * businesses.lat/lng.
   */
  locations?: {
    label: string | null;
    address: string;
    lat: number | null;
    lng: number | null;
  }[] | null;
}

interface DirectoryFacets {
  categories: string[];
  locations: string[];
}

/**
 * Derive a place ("City, ST") from a location string.
 * Must match the server-side deriveLocation (route.ts) so client filters
 * agree with API facets. Returns null when no City, ST shape is present.
 */
function deriveLocation(address: string): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const stateMatch = parts[parts.length - 1].match(/^([A-Za-z]{2})(?:\s+\d{5})?$/);
  if (!stateMatch) return null;
  return `${parts[parts.length - 2]}, ${stateMatch[1]}`;
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
    imageUrl: item.imageUrl ?? '',
    description: item.description || (item.website ? `Website: ${item.website}` : ''),
    tags: item.tags ?? [],
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
  // Free-text search (name, location, category, tags); synced to the URL
  const [search, setSearch] = useState<string>(() => searchParams.get('search') ?? '');
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

  // Write filters + search back to the URL so the current view is shareable
  // and survives a reload. Uses replace (not push) so tweaks don't pile up
  // history entries.
  const pushUrl = (f: FilterOption, s: string) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string | null) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };
    setOrDelete('category', f.category ?? null);
    setOrDelete('location', f.location ?? null);
    setOrDelete('minRating', f.minRating ? String(f.minRating) : null);
    setOrDelete('verifiedOnly', f.verifiedOnly ? 'true' : null);
    setOrDelete('search', s || null);

    const query = params.toString();
    router.replace(query ? `/directory?${query}` : '/directory', { scroll: false });
  };

  const handleFilterChange = (newFilters: FilterOption) => {
    setFilters(newFilters);
    pushUrl(newFilters, search);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    pushUrl(filters, value);
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

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.location.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          (b.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }

    if (filters.category) {
      result = result.filter((b) => b.category === filters.category);
    }
    if (filters.location) {
      result = result.filter((b) => {
        const loc = deriveLocation(b.location);
        return loc !== null && loc === filters.location;
      });
    }
    if (filters.minRating) {
      result = result.filter((b) => b.rating !== null && b.rating >= filters.minRating!);
    }
    if (filters.verifiedOnly) {
      result = result.filter((b) => b.isVerified);
    }

    return result;
  }, [directory, filters, search]);

  const sortedDirectory = useMemo(
    () => sortDirectory(filteredDirectory, sort),
    [filteredDirectory, sort]
  );

  const savedDirectory = useMemo(
    () => directory.filter((b) => savedBusinesses.has(b.id)),
    [directory, savedBusinesses]
  );

  const listSource = activeTab === 'all' ? sortedDirectory : savedDirectory;

  const displayBusinesses: Business[] = listSource.map(toCardBusiness);

  const mapPins = useMemo<MapPin[]>(
    () =>
      listSource.flatMap((b): MapPin[] => {
        // One pin per physical location (primary first) when the business
        // has entries in business_locations; otherwise the legacy single
        // pin carried on the business row itself.
        const locs = (b.locations ?? []).filter((l) => l.lat != null && l.lng != null);
        if (locs.length > 0) {
          return locs.map((l) => ({
            id: b.id,
            name: l.label ? `${b.name} — ${l.label}` : b.name,
            lat: l.lat as number,
            lng: l.lng as number,
          }));
        }
        return b.lat != null && b.lng != null
          ? [{ id: b.id, name: b.name, lat: b.lat as number, lng: b.lng as number }]
          : [];
      }),
    [listSource]
  );

  return (
    <main className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Page Header */}
      <section className="bg-gradient-to-br from-[#E31C25] via-black to-[#009B3F] text-white py-10">
        <div className="px-4 sm:px-6 lg:px-8">
          <p className="text-xs uppercase tracking-widest text-white/70 mb-2">
            Black-owned businesses in
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">
            {filters.location || "All areas"}
          </h1>
          <p className="mt-3 text-lg text-neutral-100">
            {displayBusinesses.length} {displayBusinesses.length === 1 ? 'place' : 'places'}
            {filters.category ? ` · ${filters.category}` : ''}
          </p>
        </div>
      </section>

      {/* Filter Row - full width sticky band, single row like OpenTable */}
      <div className="sticky top-16 z-30 border-b border-neutral-200 bg-white">
        <div className="px-4 sm:px-6 lg:px-8 py-2.5">
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
            search={search}
            onSearchChange={handleSearchChange}
          />
        </div>
      </div>

      {/* Main Content - Split View */}
      <section className="relative flex h-[calc(100vh-310px)] min-h-[480px] overflow-hidden">
        {/* Business List - Left Side */}
        <div className={`${showMap ? 'lg:w-[40%]' : 'w-full'} overflow-y-auto`}>
          <div className="p-4 space-y-4">

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
              <div className={showMap ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>
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
          <div className="hidden lg:block flex-1 h-full border-l border-neutral-200 relative isolate">
            {/* Map Toggle Button */}
            <button
              onClick={() => setShowMap(false)}
              className="absolute top-4 right-4 z-[1001] bg-white px-3 py-2 rounded-lg shadow-md text-sm font-medium hover:bg-neutral-50"
            >
              Hide Map ×
            </button>
            <MapView pins={mapPins} />
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
