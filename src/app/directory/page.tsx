'use client';

import React, { useState, useMemo } from 'react';
import BusinessCard, { Business } from '@/components/ui/BusinessCard';
import FilterBar, { FilterOption, SortOption } from '@/components/ui/FilterBar';
import { Navigation } from '@/components/ui/Navigation';
import { Tabs, TabPanel } from '@/components/ui/Tabs';

// Mock data - in production this would come from an API
const MOCK_BUSINESSES: Business[] = [
  {
    id: '1',
    name: 'Soul Food Kitchen',
    category: 'Food & Dining',
    rating: 4.8,
    reviewCount: 156,
    location: 'Harlem, NY',
    isVerified: true,
    imageUrl: '',
    description: 'Authentic Southern cuisine with a modern twist. Family-owned since 1985.',
    tags: ['Southern', 'Family-Friendly', 'Takeout'],
  },
  {
    id: '2',
    name: 'Black Diamond Consulting',
    category: 'Professional Services',
    rating: 5.0,
    reviewCount: 42,
    location: 'Atlanta, GA',
    isVerified: true,
    imageUrl: '',
    description: 'Strategic business consulting for Black-owned enterprises and startups.',
    tags: ['Consulting', 'Business Strategy', 'B2B'],
  },
  {
    id: '3',
    name: 'Afro Threads',
    category: 'Retail & Fashion',
    rating: 4.5,
    reviewCount: 89,
    location: 'Los Angeles, CA',
    isVerified: false,
    imageUrl: '',
    description: 'Contemporary fashion inspired by African heritage and modern streetwear.',
    tags: ['Clothing', 'Accessories', 'African-Inspired'],
  },
  {
    id: '4',
    name: 'Heritage Wellness Center',
    category: 'Health & Wellness',
    rating: 4.9,
    reviewCount: 203,
    location: 'Chicago, IL',
    isVerified: true,
    imageUrl: '',
    description: 'Holistic health services including massage, acupuncture, and nutrition counseling.',
    tags: ['Wellness', 'Massage', 'Holistic'],
  },
  {
    id: '5',
    name: 'Golden Era Barbershop',
    category: 'Personal Services',
    rating: 4.7,
    reviewCount: 312,
    location: 'Houston, TX',
    isVerified: true,
    imageUrl: '',
    description: 'Classic barbershop experience with modern styling. Community hub since 1978.',
    tags: ['Barber', 'Grooming', 'Community'],
  },
  {
    id: '6',
    name: 'Rhythm & Blues Records',
    category: 'Entertainment',
    rating: 4.6,
    reviewCount: 78,
    location: 'New Orleans, LA',
    isVerified: false,
    imageUrl: '',
    description: 'Vinyl records, rare finds, and custom audio equipment. Music lovers paradise.',
    tags: ['Music', 'Vinyl', 'Audio'],
  },
];

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
  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');
  const [filters, setFilters] = useState<FilterOption>({});
  const [sort, setSort] = useState<SortOption>('relevance');
  const [savedBusinesses, setSavedBusinesses] = useState<Set<string>>(new Set());
  const [showMap, setShowMap] = useState(true);

  const handleFilterChange = (newFilters: FilterOption) => {
    setFilters(newFilters);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
  };

  const handleViewDetails = (businessId: string) => {
    console.log('View details:', businessId);
    // Navigate to business detail page
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
    const business = MOCK_BUSINESSES.find((b) => b.id === businessId);
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

  // Filter and sort businesses
  const filteredBusinesses = useMemo(() => {
    let result = [...MOCK_BUSINESSES];

    // Apply filters
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

    // Apply sort
    switch (sort) {
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'distance':
        // Mock distance sorting - in production would use geolocation
        result.sort((a, b) => a.location.localeCompare(b.location));
        break;
      case 'newest':
        // Mock newest - in production would use created date
        result.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case 'relevance':
      default:
        // Default sort by rating as relevance proxy
        result.sort((a, b) => b.rating - a.rating);
        break;
    }

    return result;
  }, [filters, sort]);

  const savedBusinessList = useMemo(() => {
    return MOCK_BUSINESSES.filter((b) => savedBusinesses.has(b.id));
  }, [savedBusinesses]);

  const displayBusinesses = activeTab === 'all' ? filteredBusinesses : savedBusinessList;

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Page Header */}
      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">Business Directory</h1>
          <p className="text-xl text-neutral-100 max-w-3xl">
            Discover Black-owned businesses in your area. Filter by category, rating, and location
            to find exactly what you need.
          </p>
        </div>
      </section>

      {/* Main Content - Split View */}
      <section className="flex h-[calc(100vh-140px)] overflow-hidden max-w-7xl mx-auto">
        {/* Business List - Left Side */}
        <div className={`${showMap ? 'lg:w-1/2' : 'w-full'} overflow-y-auto p-4`}>
          {/* Tabs */}
          <Tabs
            tabs={[
              { key: 'all', label: `All Businesses (${filteredBusinesses.length})` },
              { key: 'saved', label: `Saved (${savedBusinesses.size})` },
            ]}
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(key as 'all' | 'saved')}
          />

          {/* Filter Bar */}
          <FilterBar
            categories={CATEGORIES}
            locations={LOCATIONS}
            onFilterChange={handleFilterChange}
            onSortChange={handleSortChange}
            currentSort={sort}
            currentFilters={filters}
          />

          {/* Results Count */}
          <div className="mb-6 text-neutral-600">
            {displayBusinesses.length} {displayBusinesses.length === 1 ? 'business' : 'businesses'} found
          </div>

          {/* Business List - Horizontal Cards */}
          {displayBusinesses.length > 0 ? (
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

        {/* Map Panel - Right Side */}
        {showMap && (
          <div className="hidden lg:block w-1/2 h-full border-l border-neutral-200 bg-neutral-100 relative">
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
                        {b.location}
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
                <li><a href="#" className="hover:text-white">Businesses</a></li>
                <li><a href="#" className="hover:text-white">Categories</a></li>
                <li><a href="#" className="hover:text-white">Featured</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Help Center</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
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
