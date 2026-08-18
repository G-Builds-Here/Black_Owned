'use client';

import { Navigation } from '@/components/ui/Navigation';

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">Help Center</h1>
          <p className="text-xl text-neutral-100 max-w-3xl">
            Find answers to common questions and learn how to use our platform.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800 mb-4">For Consumers</h2>
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                <h3 className="text-lg font-semibold mb-2">How do I search for businesses?</h3>
                <p className="text-neutral-600">
                  Use the search bar on the homepage or directory page to search by business name, category, or location.
                  You can also use filters to narrow your results by rating, verification status, and more.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                <h3 className="text-lg font-semibold mb-2">How do I save businesses?</h3>
                <p className="text-neutral-600">
                  Click the save button (💾) on any business card to add it to your saved list. Access your saved businesses
                  through the "Saved" tab in the directory.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                <h3 className="text-lg font-semibold mb-2">How do I share a business?</h3>
                <p className="text-neutral-600">
                  Click the share button (🔗) on any business card to share via your device's native sharing options or
                  copy the link to your clipboard.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-neutral-800 mb-4">For Business Owners</h2>
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                <h3 className="text-lg font-semibold mb-2">How do I list my business?</h3>
                <p className="text-neutral-600">
                  Click "List Your Business" on the homepage to start the process. You'll need to provide basic information
                  about your business including name, category, location, and description.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                <h3 className="text-lg font-semibold mb-2">How do I claim my business?</h3>
                <p className="text-neutral-600">
                  If your business already appears in our directory, you can claim it by visiting the "Claim Your Business"
                  page and following the verification process.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-heritage-ochre/10 p-6 rounded-lg border border-heritage-ochre/30">
            <h3 className="text-lg font-semibold mb-2">Still need help?</h3>
            <p className="text-neutral-600">
              Contact our support team at <a href="mailto:support@blackowned.com" className="text-heritage-ochre hover:underline">support@blackowned.com</a>
            </p>
          </div>
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
