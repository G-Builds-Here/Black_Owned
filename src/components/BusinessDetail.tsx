'use client';

import React from 'react';
import { ChatButton } from './ChatButton';
import { SocialMediaSection } from './SocialMediaSection';
import { Navigation } from './ui/Navigation';
import { SocialUrls } from '@/services/social-discovery';
import MapView from './ui/MapView';
import { SimilarBusinesses } from './SimilarBusinesses';

export interface Business {
  id: string;
  name: string;
  categoryId: string;
  category?: string | null;
  description?: string | null;
  location?: string | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  imageUrl?: string | null;
  tags?: string[] | null;
  verified: boolean;
  createdAt: {
    timestamp: number;
  };
  socialUrls?: SocialUrls | null;
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
  locations?: BusinessLocation[] | null;
}

export interface BusinessLocation {
  id: string;
  label?: string | null;
  address: string;
  lat?: number | null;
  lng?: number | null;
  isPrimary: boolean;
}

export interface BusinessDetailProps {
  business: Business | null;
  loading: boolean;
  error: string | null;
}

/**
 * BusinessDetail component - displays business information
 *
 * Shows loading state while fetching, error state if fetch fails,
 * and business details (name, category, verified status) on success.
 */
export function BusinessDetail({ business, loading, error }: BusinessDetailProps) {
  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-heritage-ochre mx-auto mb-4"></div>
            <p className="text-neutral-600">Loading business details...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="text-red-600 text-4xl mb-4">!</div>
              <h2 className="text-xl font-semibold text-red-800 mb-2">
                Unable to load business
              </h2>
              <p className="text-red-700 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-6">
              <div className="text-neutral-500 text-4xl mb-4">?</div>
              <h2 className="text-xl font-semibold text-neutral-800 mb-2">
                Business not found
              </h2>
              <p className="text-neutral-600 mb-4">
                The business you are looking for does not exist or has been removed.
              </p>
              <a
                href="/directory"
                className="inline-block bg-heritage-ochre text-white px-4 py-2 rounded-lg hover:bg-heritage-ochre/90 transition-colors"
                style={{ color: '#fff', textDecoration: 'none' }}
              >
                Browse Directory
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Format timestamp to readable date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format category ID to readable category name
  const formatCategory = (categoryId: string): string => {
    // In a real app, this would fetch the category name from the categories API
    // For now, we'll display the ID as a fallback
    return categoryId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const categoryLabel =
    business.category && business.category.trim().length > 0
      ? business.category
      : formatCategory(business.categoryId);
  const rating = business.rating ?? null;
  const reviewCount = business.reviewCount ?? 0;
  const description = business.description ?? '';
  const tags = business.tags ?? [];

  // Multi-location: prefer the locations table; fall back to the legacy
  // single lat/lng pin carried on the business row itself.
  type LocEntry = { id: string; label?: string | null; address: string; lat?: number | null; lng?: number | null };
  const locationItems: LocEntry[] = (business.locations ?? []).filter((l) => l.address);
  const pinSources: LocEntry[] =
    locationItems.length > 0
      ? locationItems
      : business.lat != null && business.lng != null
        ? [{ id: business.id, address: business.location ?? business.name, lat: business.lat, lng: business.lng }]
        : [];
  const mapPins = pinSources
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id,
      name: l.label ? `${business.name} — ${l.label}` : business.name,
      lat: l.lat as number,
      lng: l.lng as number,
    }));

  return (
    <main className="min-h-screen bg-neutral-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-x-1.5 py-3 text-sm text-neutral-500"
        >
          <a
            href="/directory"
            className="transition-colors hover:text-neutral-800"
            style={{ textDecoration: 'none', color: 'inherit', minHeight: 0, minWidth: 0 }}
          >
            Directory
          </a>
          <span aria-hidden="true" className="text-neutral-400">/</span>
          <span>{categoryLabel}</span>
          <span aria-hidden="true" className="text-neutral-400">/</span>
          <span className="font-medium text-neutral-800">{business.name}</span>
        </nav>

        {/* Hero */}
        <div className="relative h-64 overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 sm:h-80 lg:h-96">
          {business.imageUrl ? (
            <img
              src={business.imageUrl}
              alt={`Photo of ${business.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center">
              <span className="text-6xl font-black text-neutral-400 sm:text-7xl" aria-hidden="true">
                {business.name.trim().charAt(0).toUpperCase() || 'B'}
              </span>
              <span className="mt-3 text-xs uppercase tracking-widest text-neutral-500 sm:text-sm">
                {categoryLabel}
              </span>
            </div>
          )}
          <div className="absolute bottom-3 left-3">
            {business.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-sm font-medium text-white shadow-md">
                <span aria-hidden="true">✓</span>
                Verified Business
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900/70 px-3 py-1 text-sm font-medium text-white shadow-md">
                Unverified
              </span>
            )}
          </div>
        </div>

        {/* Title + rating */}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-neutral-900 sm:text-3xl">
              {business.name}
            </h1>
            {business.location && (
              <p className="mt-1 flex items-center gap-1 text-neutral-600">
                <span aria-hidden="true">📍</span>
                {business.location}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {rating !== null && (
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-3xl font-bold text-heritage-ochre">
                  <span aria-hidden="true">★</span>
                  {rating.toFixed(1)}
                </div>
                <div className="text-sm text-neutral-500">
                  {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                </div>
              </div>
            )}
            <ChatButton businessId={business.id} />
          </div>
        </div>

        {/* Facts + actions */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="flex flex-col justify-center rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Category</p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-900">{categoryLabel}</p>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Listed</p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-900">
              Listed since {formatDate(business.createdAt.timestamp)}
            </p>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Source</p>
            <p className="mt-0.5 text-sm font-semibold capitalize text-neutral-900">
              {(business.source ?? 'manual').replace(/[_-]/g, ' ')}
            </p>
          </div>
          <div className="col-span-2 flex flex-col justify-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:col-span-1">
            {!business.verified && (
              <a
                href="/business/claim"
                className="block w-full rounded-lg bg-heritage-ochre px-4 py-2 text-center text-sm font-medium transition-colors hover:bg-heritage-ochre/90"
                style={{ color: '#fff', textDecoration: 'none' }}
              >
                Claim this business
              </a>
            )}
            <a
              href="/directory"
              className="block w-full rounded-lg bg-neutral-100 px-4 py-2 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
              style={{ textDecoration: 'none' }}
            >
              ← Back to Directory
            </a>
          </div>
        </div>

        {/* Body */}
        <div className="mt-6 min-w-0">
          <section className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-neutral-900">About</h2>
            {description ? (
              <p className="leading-relaxed text-neutral-700">{description}</p>
            ) : (
              <p className="text-neutral-500">
                No description yet. Claim this business to add a description and photos.
              </p>
            )}

            {(business.phone || business.website) && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-neutral-600">
                {business.phone && (
                  <a href={`tel:${business.phone}`} className="hover:text-neutral-900">
                    📞 {business.phone}
                  </a>
                )}
                {business.website && /^https?:\/\//i.test(business.website) && (
                  <a
                    href={business.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-heritage-ochre hover:underline"
                  >
                    Website
                  </a>
                )}
              </div>
            )}

            {tags.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-lg font-semibold text-neutral-900">Highlights</h2>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {(locationItems.length > 0 || mapPins.length > 0) && (
            <section className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-neutral-900">Locations</h2>
                  <ul className="mt-3 space-y-3">
                    {(locationItems.length > 0 ? locationItems : pinSources).map((loc) => (
                      <li key={loc.id} className="flex gap-2">
                        <span className="mt-0.5 shrink-0" aria-hidden="true">
                          📍
                        </span>
                        <div className="min-w-0">
                          {loc.label && (
                            <p className="text-sm font-semibold text-neutral-900">{loc.label}</p>
                          )}
                          <p className="text-sm text-neutral-600">{loc.address}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {mapPins.length > 0 && (
                  <div className="h-64 border-t border-neutral-200 lg:h-auto lg:min-h-[280px] lg:border-l lg:border-t-0">
                    <MapView pins={mapPins} />
                  </div>
                )}
              </div>
            </section>
          )}

          <SocialMediaSection business={business} />
        </div>

        {/* Similar businesses */}
        <SimilarBusinesses category={business.category || business.categoryId} excludeId={business.id} />
      </div>
    </main>
  );
}

export default BusinessDetail;
