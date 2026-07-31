'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Badge, SearchBar, Navigation } from '@/components/ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
}

export default function Home() {
  const router = useRouter();
  const [featuredBusinesses, setFeaturedBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch featured businesses from API
    const fetchFeatured = async () => {
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query Businesses($first: Int, $after: String) {
                businesses(first: $first, after: $after) {
                  edges {
                    node {
                      id
                      name
                      categoryId
                      verified
                      description
                      ratingAvg
                      reviewCount
                    }
                  }
                }
              }
            `,
            variables: { first: 6, after: null },
          }),
        });
        const json = await response.json();
        if (json.data?.businesses?.edges) {
          const formatCategory = (id: string) => id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          setFeaturedBusinesses(json.data.businesses.edges.map((edge: any) => {
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
            };
          }));
        }
      } catch (err) {
        console.error('Failed to fetch featured businesses:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFeatured();
  }, []);

  const handleSearch = (query: string, filters: string[]) => {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (filters.length > 0) params.set('category', filters.join(','));
    router.push(`/directory?${params.toString()}`);
  };

  const handleNavigate = (section: 'directory' | 'admin' | 'user' | 'home') => {
    if (section === 'directory') {
      router.push('/directory');
    } else if (section === 'admin') {
      router.push('/admin');
    }
  };

  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <Navigation onNavigate={handleNavigate} />

      {/* Kente Pattern Header */}
      <div className="h-2 bg-gradient-to-r from-heritage-ochre via-heritage-gold to-heritage-forest" />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white relative overflow-hidden">
        {/* Afro-American Heritage inspired pattern - bold red, black, green geometric overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Red layer - top left diagonal */}
          <div className="absolute top-0 left-0 w-2/5 h-full" style={{
            backgroundColor: '#BF0A30',
            clipPath: 'polygon(0 0, 100% 0, 70% 100%, 0% 100%)'
          }}></div>
          {/* Green layer - bottom right diagonal */}
          <div className="absolute bottom-0 right-0 w-1/2 h-3/4" style={{
            backgroundColor: '#006B3F',
            clipPath: 'polygon(30% 0%, 100% 0, 100% 100%, 0% 100%)'
          }}></div>
          {/* Black accent - full overlay */}
          <div className="absolute inset-0 bg-black"></div>
          {/* Geometric pattern overlay */}
          <div className="absolute inset-0" style={{
            backgroundImage: `
              repeating-linear-gradient(30deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 80px),
              repeating-linear-gradient(-30deg, transparent, transparent 40px, rgba(191,10,48,0.05) 40px, rgba(191,10,48,0.05) 80px),
              repeating-linear-gradient(-30deg, transparent, transparent 40px, rgba(0,107,63,0.05) 40px, rgba(0,107,63,0.05) 80px)
            `
          }}></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative z-10">
          <div className="text-center">
            {/* Search Bar with Category Filters */}
            <SearchBar
              onSearch={handleSearch}
              placeholder="Search for restaurants, services, shops, and more..."
            />
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 bg-white relative">
        {/* Subtle Kente-inspired border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-heritage-ochre via-heritage-gold to-heritage-forest" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Business Categories
            </h2>
            <p className="text-neutral-600 max-w-2xl mx-auto mb-8">
              From Harlem to Atlanta, Lagos to Los Angeles — discover Black excellence across every sector.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button variant="primary" size="lg" onClick={() => router.push('/directory')}>
                Explore Businesses
              </Button>
              <Button variant="tertiary" size="lg" onClick={() => router.push('/business/claim')}>
                List Your Business
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {['Food & Dining', 'Professional Services', 'Retail & Fashion', 'Health & Wellness'].map((category, idx) => (
              <Card key={category} variant="elevated" padding="md" clickable onClick={() => router.push(`/directory?category=${encodeURIComponent(category)}`)}>
                <div className="text-center group text-neutral-900">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                    idx === 0 ? 'bg-heritage-terracotta/10' :
                    idx === 1 ? 'bg-heritage-forest/10' :
                    idx === 2 ? 'bg-heritage-gold/10' :
                    'bg-heritage-jade/10'
                  }`}>
                    <span className="text-2xl">{idx === 0 ? '🍽️' : idx === 1 ? '💼' : idx === 2 ? '👗' : '🧘'}</span>
                  </div>
                  <h3 className="font-semibold">{category}</h3>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Businesses */}
      <section className="py-16 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold">Featured Businesses</h2>
            <Button variant="ghost" size="md" onClick={() => router.push('/directory')}>
              View All
            </Button>
          </div>
          {loading ? (
            <div className="text-center py-12 text-neutral-500">Loading businesses...</div>
          ) : featuredBusinesses.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">No businesses found yet. Be the first to list your business!</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {featuredBusinesses.slice(0, 3).map((business) => (
                <Card key={business.id} variant="elevated" padding="lg" clickable>
                  <div className="aspect-video bg-neutral-200 rounded-lg mb-4 overflow-hidden">
                    {business.imageUrl ? (
                      <img src={business.imageUrl} alt={business.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-400">No Image</div>
                    )}
                  </div>
                  <Badge variant="primary" size="sm" className="mb-2">
                    {business.category}
                  </Badge>
                  <h3 className="text-xl font-semibold mb-2">{business.name}</h3>
                  {business.isVerified && <Badge variant="secondary" size="sm" className="mb-2">✓ Verified</Badge>}
                  <p className="text-neutral-600 mb-4 line-clamp-2">{business.description || 'No description available.'}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-500">{business.location}</span>
                    <Button variant="secondary" size="sm" onClick={() => router.push(`/business/${business.id}`)}>
                      Learn More
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Heritage / About Section */}
      <section id="about" className="py-20 bg-heritage-forest text-white relative overflow-hidden">
        {/* Kente-inspired pattern overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
          backgroundImage: `repeating-linear-gradient(90deg, #FFD700 0px, #FFD700 20px, transparent 20px, transparent 40px), repeating-linear-gradient(0deg, #CC7722 0px, #CC7722 15px, transparent 15px, transparent 30px)`,
          backgroundSize: '60px 60px'
        }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-5xl font-bold mb-6">Rooted in Heritage & Celebrating Black Excellence</h2>
            <p className="text-xl text-neutral-100 max-w-3xl mx-auto mb-6">
              Discover and support Black-owned businesses. A platform rooted in heritage,
              built for community, and inspired by the rich traditions of Black American
              and African history.
            </p>
            <p className="text-lg text-neutral-100 max-w-3xl mx-auto">
              Our design celebrates the rich cultural traditions of Black American and
              African history, from Kente cloth patterns to Bogolanfini mud cloth aesthetics.
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

      {/* CTA / Contact Section */}
      <section id="contact" className="py-20 bg-neutral-100 dark:bg-neutral-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-neutral-900 dark:text-white mb-6">Join Our Community</h2>
          <p className="text-xl text-neutral-600 dark:text-neutral-300 mb-8">
            Whether you're a business owner looking to showcase your enterprise or a
            consumer seeking to support Black-owned businesses, you belong here.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            <Button variant="primary" size="lg" onClick={() => router.push('/business/claim')}>
              List Your Business
            </Button>
            <Button variant="secondary" size="lg" onClick={() => router.push('/directory')}>
              Explore Businesses
            </Button>
          </div>
          {/* Contact Form */}
          <div className="max-w-md mx-auto text-left">
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">Send us a message</h3>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Name</label>
                <input type="text" className="w-full px-4 py-2 rounded-lg bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white focus:border-heritage-ochre focus:outline-none" placeholder="Your name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Email</label>
                <input type="email" className="w-full px-4 py-2 rounded-lg bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white focus:border-heritage-ochre focus:outline-none" placeholder="your@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Message</label>
                <textarea className="w-full px-4 py-2 rounded-lg bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white focus:border-heritage-ochre focus:outline-none h-32" placeholder="How can we help?"></textarea>
              </div>
              <Button variant="primary" size="md" className="w-full">
                Send Message
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-neutral-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold mb-2">How do I list my business?</h3>
              <p className="text-neutral-600">Click "List Your Business" and fill out the application form. We review all submissions within 48 hours.</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold mb-2">Is listing free?</h3>
              <p className="text-neutral-600">Yes, basic listings are free. Verified badges and featured placements have optional fees.</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold mb-2">How do I verify my business?</h3>
              <p className="text-neutral-600">Submit your business license and tax ID through the admin dashboard. Verification typically takes 2-3 business days.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy / Terms Section */}
      <section id="privacy" className="py-12 bg-neutral-100 text-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold mb-4">Privacy Policy</h2>
          <p className="text-neutral-600 mb-4">We respect your privacy and are committed to protecting your personal information. See our full privacy policy for details on how we collect, use, and safeguard your data.</p>
        </div>
      </section>

      <section id="terms" className="py-12 bg-neutral-100 text-sm border-t border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold mb-4">Terms of Service</h2>
          <p className="text-neutral-600 mb-4">By using Black Owned, you agree to our terms of service. This includes guidelines for business listings, reviews, and community conduct.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-white py-12">
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
                <li><Link href="/directory" className="hover:text-heritage-ochre transition-colors">Businesses</Link></li>
                <li><Link href="/directory" className="hover:text-heritage-ochre transition-colors">Categories</Link></li>
                <li><Link href="/#about" className="hover:text-heritage-ochre transition-colors">Featured</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#contact" className="hover:text-heritage-ochre transition-colors">Help Center</Link></li>
                <li><Link href="/#contact" className="hover:text-heritage-ochre transition-colors">Contact</Link></li>
                <li><Link href="/#faq" className="hover:text-heritage-ochre transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#privacy" className="hover:text-heritage-ochre transition-colors">Privacy Policy</Link></li>
                <li><Link href="/#terms" className="hover:text-heritage-ochre transition-colors">Terms of Service</Link></li>
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
