'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, Badge, SearchBar, Navigation } from '@/components/ui';

interface FeaturedBusiness {
  id: string;
  name: string;
  address?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
}

export default function Home() {
  const [featured, setFeatured] = useState<FeaturedBusiness[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFeatured() {
      try {
        const res = await fetch('/api/featured-businesses?limit=10');
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json?.error || 'Failed to load featured businesses');
        }
        if (!cancelled) setFeatured(json.data ?? []);
      } catch (err) {
        if (!cancelled) {
          setFeaturedError(err instanceof Error ? err.message : 'Failed to load featured businesses');
        }
      } finally {
        if (!cancelled) setFeaturedLoading(false);
      }
    }
    loadFeatured();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = (query: string, filters: string[]) => {
    console.log('Search:', { query, filters });
    // TODO: Implement search logic
  };

  const handleNavigate = (section: 'directory' | 'admin' | 'user' | 'home') => {
    const paths: Record<typeof section, string> = {
      directory: '/directory',
      admin: '/admin',
      user: '/admin/users',
      home: '/',
    };
    window.location.href = paths[section];
  };

  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <Navigation onNavigate={handleNavigate} />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#E31C25] via-black to-[#009B3F] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-6xl md:text-7xl font-bold mb-8">
              Celebrating Black Excellence
            </h1>
            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <Link href="/directory">
                <Button variant="primary" size="lg">
                  Explore Businesses
                </Button>
              </Link>
              <Link href="/business/claim">
                <Button variant="secondary" size="lg">
                  List Your Business
                </Button>
              </Link>
            </div>

            {/* Search Bar with Category Filters */}
            <SearchBar
              onSearch={handleSearch}
              placeholder="Search for restaurants, services, shops, and more..."
            />
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            Business Categories
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {['Food & Dining', 'Professional Services', 'Retail & Fashion', 'Health & Wellness'].map((category) => (
              <Link key={category} href={`/directory?category=${encodeURIComponent(category)}`}>
                <Card variant="elevated" padding="md" clickable>
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-heritage-ochre/10 rounded-full flex items-center justify-center">
                      <span className="text-2xl">✨</span>
                    </div>
                    <h3 className="font-semibold text-neutral-800">{category}</h3>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Businesses */}
      <section className="py-16 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold">Featured Businesses</h2>
            <Link href="/directory">
              <Button variant="ghost" size="md">
                View All
              </Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {featuredLoading ? (
              <p className="col-span-full text-neutral-500">Loading featured businesses…</p>
            ) : featured.length === 0 ? (
              <p className="col-span-full text-neutral-500">
                {featuredError
                  ? `Could not load featured businesses: ${featuredError}`
                  : 'No featured businesses yet. Run the scraper to populate this section.'}
              </p>
            ) : (
              featured.map((b) => (
                <Link key={b.id} href={`/business/${b.id}`}>
                  <Card variant="elevated" padding="lg" clickable>
                    <div className="aspect-video bg-neutral-200 rounded-lg mb-4">
                      {/* Placeholder for business image */}
                    </div>
                    <Badge variant="primary" size="sm" className="mb-2">
                      Featured
                    </Badge>
                    <h3 className="text-xl font-semibold mb-2">{b.name}</h3>
                    <p className="text-neutral-600 mb-4">
                      {[b.category, b.address].filter(Boolean).join(' · ') ||
                        'Showcasing the quality and excellence of Black-owned enterprises.'}
                    </p>
                    {(b.rating != null || b.reviewCount != null) && (
                      <p className="text-sm text-neutral-500 mb-3">
                        {b.rating != null ? `★ ${b.rating}` : ''}
                        {b.rating != null && b.reviewCount != null ? ' · ' : ''}
                        {b.reviewCount != null ? `${b.reviewCount} reviews` : ''}
                      </p>
                    )}
                    <Button variant="secondary" size="sm">
                      Learn More
                    </Button>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Heritage Section */}
      <section className="py-20 bg-neutral-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Rooted in Heritage & Celebrating Black Excellence</h2>
            <p className="text-xl text-neutral-300 max-w-3xl mx-auto">
              Discover and support Black-owned businesses. A platform rooted in heritage, built for community, and inspired by the rich traditions of Black American and African history.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-5xl mb-4">🏛️</div>
              <h3 className="text-xl font-semibold mb-2">Historical Roots</h3>
              <p className="text-neutral-100">
                Honoring the legacy of Black entrepreneurship and community building.
              </p>
            </div>
            <div className="text-center">
              <div className="text-5xl mb-4">🎨</div>
              <h3 className="text-xl font-semibold mb-2">Cultural Design</h3>
              <p className="text-neutral-100">
                Visual elements inspired by African textiles and artistic traditions.
              </p>
            </div>
            <div className="text-center">
              <div className="text-5xl mb-4">🤝</div>
              <h3 className="text-xl font-semibold mb-2">Community First</h3>
              <p className="text-neutral-100">
                Building connections between consumers and Black-owned businesses.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-neutral-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">Join Our Community</h2>
          <p className="text-xl text-neutral-300 mb-8">
            Whether you're a business owner looking to showcase your enterprise or a
            consumer seeking to support Black-owned businesses, you belong here.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/directory">
              <Button variant="primary" size="lg">
                Browse Directory
              </Button>
            </Link>
            <Link href="/business/claim">
              <Button variant="ghost" size="lg" className="text-white hover:bg-neutral-700">
                List Your Business
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-neutral-400 py-12">
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
          <div className="border-t border-neutral-800 mt-12 pt-8 text-center text-sm">
            <p>&copy; 2026 Black Owned. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
