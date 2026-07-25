'use client';

import { Button, Card, Badge, SearchBar, Navigation } from '@/components/ui';

export default function Home() {
  const handleSearch = (query: string, filters: string[]) => {
    console.log('Search:', { query, filters });
    // TODO: Implement search logic
  };

  const handleNavigate = (section: 'directory' | 'admin' | 'user' | 'home') => {
    console.log('Navigate to:', section);
    // TODO: Implement navigation
  };

  return (
    <main className="min-h-screen" role="main">
      {/* Navigation */}
      <Navigation onNavigate={handleNavigate} />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white" aria-labelledby="hero-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <Badge variant="secondary" size="md" className="mb-6">
              Celebrating Black Excellence
            </Badge>
            <h1 id="hero-heading" className="text-5xl md:text-6xl font-bold mb-6">
              Black Owned
            </h1>
            <p className="text-xl md:text-2xl text-neutral-100 max-w-3xl mx-auto mb-8">
              Discover and support Black-owned businesses. A platform rooted in heritage,
              built for community, and inspired by the rich traditions of Black American
              and African history.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-12" role="group" aria-label="Primary actions">
              <Button variant="primary" size="lg" aria-label="Explore businesses directory">
                Explore Businesses
              </Button>
              <Button variant="tertiary" size="lg" aria-label="Submit your business for listing">
                List Your Business
              </Button>
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
      <section className="py-16 bg-white" aria-labelledby="categories-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="categories-heading" className="text-3xl font-bold text-center mb-12">
            Business Categories
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6" role="group" aria-label="Business category filters">
            {['Food & Dining', 'Professional Services', 'Retail & Fashion', 'Health & Wellness'].map((category) => (
              <Card key={category} variant="elevated" padding="md" clickable aria-label={`Browse ${category} category`}>
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-heritage-ochre/10 rounded-full flex items-center justify-center" aria-hidden="true">
                    <span className="text-2xl">✨</span>
                  </div>
                  <h3 className="font-semibold text-neutral-800">{category}</h3>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Businesses */}
      <section className="py-16 bg-neutral-50" aria-labelledby="featured-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h2 id="featured-heading" className="text-3xl font-bold">Featured Businesses</h2>
            <Button variant="ghost" size="md" aria-label="View all featured businesses">
              View All
            </Button>
          </div>
          <div className="grid md:grid-cols-3 gap-6" role="list" aria-label="Featured businesses list">
            {[1, 2, 3].map((i) => (
              <Card key={i} variant="elevated" padding="lg" role="listitem" aria-label={`Featured business ${i}`}>
                <div className="aspect-video bg-neutral-200 rounded-lg mb-4" aria-hidden="true">
                  {/* Placeholder for business image */}
                </div>
                <Badge variant="primary" size="sm" className="mb-2">
                  Featured
                </Badge>
                <h3 className="text-xl font-semibold mb-2">Business Name {i}</h3>
                <p className="text-neutral-600 mb-4">
                  Category description goes here. Showcasing the quality and excellence
                  of Black-owned enterprises.
                </p>
                <Button variant="secondary" size="sm" aria-label={`Learn more about Business Name ${i}`}>
                  Learn More
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Heritage Section */}
      <section className="py-20 bg-heritage-forest text-white" aria-labelledby="heritage-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 id="heritage-heading" className="text-4xl font-bold mb-4">Rooted in Heritage</h2>
            <p className="text-xl text-neutral-100 max-w-3xl mx-auto">
              Our design celebrates the rich cultural traditions of Black American and
              African history, from Kente cloth patterns to Bogolanfini mud cloth aesthetics.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8" role="group" aria-label="Heritage highlights">
            <div className="text-center">
              <div className="text-5xl mb-4" aria-hidden="true">🏛️</div>
              <h3 className="text-xl font-semibold mb-2">Historical Roots</h3>
              <p className="text-neutral-100">
                Honoring the legacy of Black entrepreneurship and community building.
              </p>
            </div>
            <div className="text-center">
              <div className="text-5xl mb-4" aria-hidden="true">🎨</div>
              <h3 className="text-xl font-semibold mb-2">Cultural Design</h3>
              <p className="text-neutral-100">
                Visual elements inspired by African textiles and artistic traditions.
              </p>
            </div>
            <div className="text-center">
              <div className="text-5xl mb-4" aria-hidden="true">🤝</div>
              <h3 className="text-xl font-semibold mb-2">Community First</h3>
              <p className="text-neutral-100">
                Building connections between consumers and Black-owned businesses.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-neutral-900 text-white" aria-labelledby="cta-heading">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 id="cta-heading" className="text-4xl font-bold mb-6">Join Our Community</h2>
          <p className="text-xl text-neutral-300 mb-8">
            Whether you're a business owner looking to showcase your enterprise or a
            consumer seeking to support Black-owned businesses, you belong here.
          </p>
          <div className="flex flex-wrap justify-center gap-4" role="group" aria-label="Get started actions">
            <Button variant="primary" size="lg" aria-label="Get started with Black Owned platform">
              Get Started
            </Button>
            <Button variant="ghost" size="lg" className="text-white hover:bg-neutral-800" aria-label="Learn more about our mission">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-neutral-400 py-12" role="contentinfo">
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
              <ul className="space-y-2 text-sm" role="list">
                <li><a href="#" className="hover:text-white" aria-label="Browse businesses">Businesses</a></li>
                <li><a href="#" className="hover:text-white" aria-label="Browse categories">Categories</a></li>
                <li><a href="#" className="hover:text-white" aria-label="View featured businesses">Featured</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm" role="list">
                <li><a href="#" className="hover:text-white" aria-label="Visit help center">Help Center</a></li>
                <li><a href="#" className="hover:text-white" aria-label="Contact support">Contact</a></li>
                <li><a href="#" className="hover:text-white" aria-label="View frequently asked questions">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm" role="list">
                <li><a href="#" className="hover:text-white" aria-label="Read privacy policy">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white" aria-label="Read terms of service">Terms of Service</a></li>
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
