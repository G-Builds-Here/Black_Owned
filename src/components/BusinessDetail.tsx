'use client';

import React from 'react';

export interface Business {
  id: string;
  name: string;
  categoryId: string;
  verified: boolean;
  createdAt: {
    timestamp: number;
  };
  description?: string;
  location?: string;
  imageUrl?: string;
  tags?: string[];
  scrapedData?: ScrapeMetadata;
}

export interface ScrapeMetadata {
  scrapedAt: string;
  sourceUrl: string;
  rawDescription?: string;
  rawContactInfo?: string;
  rawAddress?: string;
  rawPhoneNumber?: string;
  rawWebsite?: string;
}

export interface BusinessDetailProps {
  business: Business | null;
  loading: boolean;
  error: string | null;
  expanded?: boolean;
  onCollapse?: () => void;
}

/**
 * BusinessDetail component - displays business information
 *
 * Shows loading state while fetching, error state if fetch fails,
 * and business details (name, category, verified status) on success.
 * When expanded is true, shows all fields including scraped data in a panel.
 */
export function BusinessDetail({ business, loading, error, expanded, onCollapse }: BusinessDetailProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-heritage-ochre mx-auto mb-4"></div>
          <p className="text-neutral-600">Loading business details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
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
    );
  }

  if (!business) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
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
            >
              Browse Directory
            </a>
          </div>
        </div>
      </div>
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

  // Render expanded panel view (inline in directory)
  if (expanded && business) {
    return (
      <div className="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm">
        {/* Header with collapse button */}
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-neutral-200">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {business.verified && (
                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                  <span aria-hidden="true">✓</span>
                  Verified
                </span>
              )}
              <span className="inline-flex items-center bg-neutral-100 text-neutral-700 px-2 py-1 rounded-full text-xs font-medium">
                {formatCategory(business.categoryId)}
              </span>
            </div>
            <h3 className="text-xl font-semibold text-neutral-900">{business.name}</h3>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="text-neutral-500 hover:text-neutral-700 p-1"
              aria-label="Collapse details"
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>

        {/* All Business Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-neutral-50 rounded-lg p-3">
            <h4 className="text-xs font-medium text-neutral-500 mb-1">Business ID</h4>
            <p className="text-neutral-800 font-mono text-xs">{business.id}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3">
            <h4 className="text-xs font-medium text-neutral-500 mb-1">Status</h4>
            <p className="text-neutral-800 text-sm">
              {business.verified ? (
                <span className="text-green-600 font-medium">Verified</span>
              ) : (
                <span className="text-neutral-500">Unverified</span>
              )}
            </p>
          </div>
          {business.description && (
            <div className="bg-neutral-50 rounded-lg p-3 md:col-span-2">
              <h4 className="text-xs font-medium text-neutral-500 mb-1">Description</h4>
              <p className="text-neutral-800 text-sm">{business.description}</p>
            </div>
          )}
          {business.location && (
            <div className="bg-neutral-50 rounded-lg p-3">
              <h4 className="text-xs font-medium text-neutral-500 mb-1">Location</h4>
              <p className="text-neutral-800 text-sm">{business.location}</p>
            </div>
          )}
          {business.imageUrl && (
            <div className="bg-neutral-50 rounded-lg p-3">
              <h4 className="text-xs font-medium text-neutral-500 mb-1">Image</h4>
              <img src={business.imageUrl} alt="" className="w-full h-24 object-cover rounded" />
            </div>
          )}
          {business.tags && business.tags.length > 0 && (
            <div className="bg-neutral-50 rounded-lg p-3">
              <h4 className="text-xs font-medium text-neutral-500 mb-1">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {business.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-neutral-200 text-neutral-700 px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="bg-neutral-50 rounded-lg p-3">
            <h4 className="text-xs font-medium text-neutral-500 mb-1">Joined</h4>
            <p className="text-neutral-800 text-sm">{formatDate(business.createdAt.timestamp)}</p>
          </div>
        </div>

        {/* Scraped Data Section */}
        {business.scrapedData && (
          <div className="mt-4 pt-4 border-t border-neutral-200">
            <h4 className="text-sm font-semibold text-neutral-700 mb-3">Original Scraped Data</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <h5 className="text-xs font-medium text-amber-800 mb-1">Source URL</h5>
                <p className="text-amber-900 text-xs break-all">{business.scrapedData.sourceUrl}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <h5 className="text-xs font-medium text-amber-800 mb-1">Scraped At</h5>
                <p className="text-amber-900 text-sm">{new Date(business.scrapedData.scrapedAt).toLocaleString()}</p>
              </div>
              {business.scrapedData.rawDescription && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 md:col-span-2">
                  <h5 className="text-xs font-medium text-amber-800 mb-1">Raw Description</h5>
                  <p className="text-amber-900 text-sm whitespace-pre-wrap">{business.scrapedData.rawDescription}</p>
                </div>
              )}
              {business.scrapedData.rawAddress && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <h5 className="text-xs font-medium text-amber-800 mb-1">Raw Address</h5>
                  <p className="text-amber-900 text-sm">{business.scrapedData.rawAddress}</p>
                </div>
              )}
              {business.scrapedData.rawPhoneNumber && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <h5 className="text-xs font-medium text-amber-800 mb-1">Raw Phone</h5>
                  <p className="text-amber-900 text-sm">{business.scrapedData.rawPhoneNumber}</p>
                </div>
              )}
              {business.scrapedData.rawWebsite && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <h5 className="text-xs font-medium text-amber-800 mb-1">Raw Website</h5>
                  <p className="text-amber-900 text-xs break-all">{business.scrapedData.rawWebsite}</p>
                </div>
              )}
              {business.scrapedData.rawContactInfo && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 md:col-span-2">
                  <h5 className="text-xs font-medium text-amber-800 mb-1">Raw Contact Info</h5>
                  <p className="text-amber-900 text-sm whitespace-pre-wrap">{business.scrapedData.rawContactInfo}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standard full-page view
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Business Header */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                {business.verified && (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                    <span aria-hidden="true">✓</span>
                    Verified Business
                  </span>
                )}
                <span className="inline-flex items-center bg-neutral-100 text-neutral-700 px-3 py-1 rounded-full text-sm font-medium">
                  {formatCategory(business.categoryId)}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-neutral-900 mb-2">
                {business.name}
              </h1>
              <p className="text-neutral-500 text-sm">
                Joined: {formatDate(business.createdAt.timestamp)}
              </p>
            </div>
          </div>

          {/* Business Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="bg-neutral-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-1">Business ID</h3>
              <p className="text-neutral-800 font-mono text-sm">{business.id}</p>
            </div>
            <div className="bg-neutral-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-1">Status</h3>
              <p className="text-neutral-800">
                {business.verified ? (
                  <span className="text-green-600 font-medium">Verified</span>
                ) : (
                  <span className="text-neutral-500">Unverified</span>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8 pt-6 border-t border-neutral-200">
            <a
              href="/directory"
              className="inline-flex items-center justify-center px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors font-medium"
            >
              ← Back to Directory
            </a>
            {business.verified && (
              <button
                className="inline-flex items-center justify-center px-4 py-2 bg-heritage-ochre text-white rounded-lg hover:bg-heritage-ochre/90 transition-colors font-medium"
              >
                Contact Business
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default BusinessDetail;
