'use client';

import { Navigation } from '@/components/ui/Navigation';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-xl text-neutral-100 max-w-3xl">
            Your privacy is important to us. Learn how we collect, use, and protect your information.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none">
          <p className="text-neutral-600 mb-8">Last updated: August 2026</p>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">Information We Collect</h2>
          <p className="text-neutral-600 mb-4">
            We collect information you provide directly to us, including:
          </p>
          <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-8">
            <li>Account information (name, email, password)</li>
            <li>Business information (name, location, category, description)</li>
            <li>Profile information you choose to provide</li>
            <li>Communications with our support team</li>
          </ul>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">How We Use Your Information</h2>
          <p className="text-neutral-600 mb-4">
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-8">
            <li>Provide and maintain our services</li>
            <li>Process your requests and transactions</li>
            <li>Send you important information about your account</li>
            <li>Improve our services and develop new features</li>
            <li>Protect against fraud and abuse</li>
          </ul>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">Data Security</h2>
          <p className="text-neutral-600 mb-8">
            We implement appropriate security measures to protect your personal information against unauthorized access,
            alteration, disclosure, or destruction. This includes encryption, secure servers, and regular security audits.
          </p>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">Your Rights</h2>
          <p className="text-neutral-600 mb-4">
            You have the right to:
          </p>
          <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-8">
            <li>Access your personal information</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Opt-out of marketing communications</li>
          </ul>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">Contact Us</h2>
          <p className="text-neutral-600">
            For privacy-related questions, contact us at <a href="mailto:privacy@blackowned.com" className="text-heritage-ochre hover:underline">privacy@blackowned.com</a>
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
