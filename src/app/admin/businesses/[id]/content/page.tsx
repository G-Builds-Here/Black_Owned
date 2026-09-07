'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navigation } from '@/components/ui/Navigation';
import { getSession, clearSession, authHeaders } from '@/lib/auth/client-session';
import { Card, Button } from '@/components/ui';
import BusinessContentEditor, { BusinessContent } from '@/components/admin/BusinessContentEditor';

/**
 * Admin content editor page — pre-fills the form from
 * GET /api/admin/businesses/[id]/content and re-renders with the saved
 * values after a successful PATCH.
 */
export default function BusinessContentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    if (session.user.role !== 'admin') {
      router.replace('/owner');
    }
  }, [router]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/admin/businesses/${params.id}/content`, {
          headers: authHeaders(),
        });
        if (response.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        const body = await response.json();
        if (response.ok) {
          setBusiness(body.data.business);
        } else {
          setLoadError(body.error || 'Failed to load business content');
        }
      } catch {
        setLoadError('Failed to load business content');
      }
    };
    load();
  }, [params.id, router]);

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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Business Content Editor</h1>
            <p className="text-neutral-100">
              Manually edit a business&apos;s website, phone, menu link, photo, and description
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loadError ? (
          <Card variant="elevated" padding="lg">
            <p className="text-sm font-medium text-heritage-crimson">{loadError}</p>
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin')}>
                Back to admin
              </Button>
            </div>
          </Card>
        ) : business ? (
          <BusinessContentEditor business={business} onSaved={setBusiness} />
        ) : (
          <div className="text-center py-8 text-neutral-500">Loading business content...</div>
        )}
      </section>
    </main>
  );
}
