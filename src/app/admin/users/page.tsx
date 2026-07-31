/**
 * User Management Page
 *
 * Admin console for managing users, roles, and status.
 */

'use client';

import React from 'react';
import { Navigation } from '@/components/ui/Navigation';
import UserManagement from '@/components/admin/UserManagement';
import Link from 'next/link';

export default function UserManagementPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Header */}
      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">User Management</h1>
              <p className="text-neutral-100">
                Manage user accounts, roles, and status
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <UserManagement />
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-white py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Kente-inspired top border */}
          <div className="h-1 bg-gradient-to-r from-heritage-ochre via-heritage-gold to-heritage-forest mb-8" />
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
                <li><Link href="/" className="hover:text-heritage-ochre transition-colors">Home</Link></li>
                <li><Link href="/directory" className="hover:text-heritage-ochre transition-colors">Directory</Link></li>
                <li><Link href="/admin" className="hover:text-heritage-ochre transition-colors">Admin</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#contact" className="hover:text-heritage-ochre transition-colors">Contact</Link></li>
                <li><Link href="/#faq" className="hover:text-heritage-ochre transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#privacy" className="hover:text-heritage-ochre transition-colors">Privacy</Link></li>
                <li><Link href="/#terms" className="hover:text-heritage-ochre transition-colors">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-sm">
            <p>&copy; 2026 Black Owned Admin Console. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
