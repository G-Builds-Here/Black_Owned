'use client';

import { Navigation } from '@/components/ui/Navigation';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
          <p className="text-xl text-neutral-100 max-w-3xl">
            Please read these terms carefully before using our services.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none">
          <p className="text-neutral-600 mb-8">Last updated: August 2026</p>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">1. Acceptance of Terms</h2>
          <p className="text-neutral-600 mb-8">
            By accessing and using Black Owned, you accept and agree to be bound by these Terms of Service. If you do
            not agree to these terms, please do not use our services.
          </p>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">2. Use of Service</h2>
          <p className="text-neutral-600 mb-4">
            You agree to use the service only for lawful purposes and in accordance with these terms. You agree not to:
          </p>
          <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-8">
            <li>Use the service in any way that violates applicable laws</li>
            <li>Interfere with or disrupt the service or servers</li>
            <li>Attempt to gain unauthorized access to any part of the service</li>
            <li>Use the service to transmit false or misleading information</li>
            <li>Interfere with the proper working of the service</li>
          </ul>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">3. User Accounts</h2>
          <p className="text-neutral-600 mb-4">
            If you create an account, you are responsible for maintaining the confidentiality of your credentials and
            for all activities that occur under your account. You must:
          </p>
          <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-8">
            <li>Provide accurate and complete information</li>
            <li>Notify us immediately of any unauthorized use</li>
            <li>Maintain and update your account information</li>
          </ul>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">4. Business Listings</h2>
          <p className="text-neutral-600 mb-4">
            Business owners who list on our platform agree to:
          </p>
          <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-8">
            <li>Provide accurate and truthful information about their business</li>
            <li>Not post misleading or fraudulent content</li>
            <li>Comply with all applicable laws and regulations</li>
            <li>Respect the rights of other users</li>
          </ul>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">5. Intellectual Property</h2>
          <p className="text-neutral-600 mb-8">
            The service and its original content, features, and functionality are owned by Black Owned and are protected
            by international copyright, trademark, and other intellectual property laws.
          </p>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">6. Limitation of Liability</h2>
          <p className="text-neutral-600 mb-8">
            Black Owned shall not be liable for any indirect, incidental, special, consequential, or punitive damages
            resulting from your use of or inability to use the service.
          </p>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">7. Changes to Terms</h2>
          <p className="text-neutral-600 mb-8">
            We reserve the right to modify these terms at any time. We will notify users of any material changes
            by posting the new terms on the service.
          </p>

          <h2 className="text-2xl font-bold text-neutral-800 mb-4">8. Contact Information</h2>
          <p className="text-neutral-600">
            For questions about these Terms of Service, contact us at <a href="mailto:legal@blackowned.com" className="text-heritage-ochre hover:underline">legal@blackowned.com</a>
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
