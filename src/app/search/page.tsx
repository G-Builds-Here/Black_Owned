'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { SearchBar } from '@/components/ui/SearchBar';
import SearchResults from '@/components/SearchResults';
import { Navigation } from '@/components/ui/Navigation';

const SEARCH_DEBOUNCE_MS = 300;

interface Business {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  location: string;
  isVerified: boolean;
  imageUrl: string;
  description: string;
  tags: string[];
}

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
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Business[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  // Reset page when query changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  // Perform search when debounced query changes
  const performSearch = useCallback(async (searchQuery: string, currentPage: number) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotalPages(0);
      setTotalResults(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Mock search - filter mock data
      const filtered = MOCK_BUSINESSES.filter(
        (b) =>
          b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.location.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setResults(filtered);
      setTotalPages(Math.ceil(filtered.length / 10));
      setTotalResults(filtered.length);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search businesses. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger search when debounced query or page changes
  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery, page);
    }
  }, [debouncedQuery, page, performSearch]);

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

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
          <h1 className="text-4xl font-bold mb-4">Search Businesses</h1>
          <p className="text-xl text-neutral-100 max-w-3xl">
            Find Black-owned businesses by name, category, or location.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <SearchBar
          onSearch={handleSearch}
          placeholder="Search by name, category, or location..."
        />

        {/* Results */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-heritage-ochre border-t-transparent"></div>
            <p className="mt-4 text-neutral-600">Searching...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && debouncedQuery && (
          <SearchResults
            businesses={results}
            currentPage={page}
            totalPages={totalPages}
            totalResults={totalResults}
            onPageChange={handlePageChange}
          />
        )}

        {!loading && !error && debouncedQuery && results.length === 0 && (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-neutral-200">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-semibold text-neutral-800 mb-2">
              No results found
            </h3>
            <p className="text-neutral-600 mb-6 max-w-md mx-auto">
              Try searching with different keywords or check your spelling.
            </p>
          </div>
        )}

        {!loading && !error && !debouncedQuery && (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-neutral-200">
            <div className="text-6xl mb-4">🔎</div>
            <h3 className="text-2xl font-semibold text-neutral-800 mb-2">
              Start your search
            </h3>
            <p className="text-neutral-600 max-w-md mx-auto">
              Enter a search term above to find Black-owned businesses.
            </p>
          </div>
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
                <li><a href="/directory" className="hover:text-white">Categories</a></li>
                <li><a href="/directory" className="hover:text-white">Featured</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/help" className="hover:text-white">Help Center</a></li>
                <li><a href="/about" className="hover:text-white">Contact</a></li>
                <li><a href="/help" className="hover:text-white">FAQ</a></li>
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
