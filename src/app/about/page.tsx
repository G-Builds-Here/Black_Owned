'use client';

import { Navigation } from '@/components/ui/Navigation';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">About Black Owned</h1>
          <p className="text-xl text-neutral-100 max-w-3xl">
            Connecting communities through the power of Black entrepreneurship.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none">
          <h2 className="text-3xl font-bold text-neutral-800 mb-6">Our Mission</h2>
          <p className="text-neutral-600 mb-8">
            Black Owned is a platform dedicated to celebrating and supporting Black-owned businesses across the nation.
            We believe in the power of community, the strength of economic empowerment, and the importance of preserving
            and promoting Black entrepreneurship.
          </p>

          <h2 className="text-3xl font-bold text-neutral-800 mb-6">Our Story</h2>
          <p className="text-neutral-600 mb-8">
            Rooted in heritage and inspired by the rich history of Black American and African excellence, our platform
            was created to bridge the gap between consumers seeking to support Black-owned businesses and the entrepreneurs
            who build and sustain our communities.
          </p>

          <h2 className="text-3xl font-bold text-neutral-800 mb-6">What We Offer</h2>
          <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-8">
            <li>A comprehensive directory of Black-owned businesses</li>
            <li>Category-based browsing and advanced search capabilities</li>
            <li>Verified business badges for trusted establishments</li>
            <li>Community-driven reviews and ratings</li>
            <li>Resources for business owners looking to grow their presence</li>
          </ul>

          <h2 className="text-3xl font-bold text-neutral-800 mb-6">Get in Touch</h2>
          <p className="text-neutral-600 mb-4">
            Have questions, feedback, or want to list your business? We'd love to hear from you.
          </p>
          <p className="text-neutral-600">
            Email: <a href="mailto:contact@blackowned.com" className="text-heritage-ochre hover:underline">contact@blackowned.com</a>
          </p>
        </div>
      </section>

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
