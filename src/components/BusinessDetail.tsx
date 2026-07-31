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
  description: string;
  location: string;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  imageUrl: string;
  tags: string[];
}

export interface BusinessDetailProps {
  business: Business | null;
  loading: boolean;
  error: string | null;
  onBack?: () => void;
}

/**
 * BusinessDetail component - displays business information
 *
 * Shows loading state while fetching, error state if fetch fails,
 * and business details (name, category, verified status) on success.
 */
export function BusinessDetail({ business, loading, error, onBack }: BusinessDetailProps) {
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
    return categoryId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Render stars
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return (
      <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5 stars`}>
        {[...Array(5)].map((_, index) => {
          if (index < fullStars) {
            return (
              <span key={index} className="text-heritage-ochre" aria-hidden="true">
                ★
              </span>
            );
          }
          if (index === fullStars && hasHalfStar) {
            return (
              <span key={index} className="text-heritage-ochre/50" aria-hidden="true">
                ★
              </span>
            );
          }
          return (
            <span key={index} className="text-neutral-300" aria-hidden="true">
              ★
            </span>
          );
        })}
        <span className="ml-2 text-neutral-600">({business.reviewCount} reviews)</span>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Business Header */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8">
          {/* Image */}
          {business.imageUrl && (
            <div className="aspect-video rounded-lg overflow-hidden mb-6 bg-neutral-200">
              <img
                src={business.imageUrl}
                alt={business.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

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
              <div className="flex items-center gap-4 text-sm text-neutral-600">
                {renderStars(business.rating)}
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span aria-hidden="true">📍</span>
                  {business.location}
                </span>
              </div>
              <p className="text-neutral-500 text-sm mt-2">
                Joined: {formatDate(business.createdAt.timestamp)}
              </p>
            </div>
          </div>

          {/* Description */}
          {business.description && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-neutral-800 mb-2">About</h3>
              <p className="text-neutral-600 leading-relaxed">{business.description}</p>
            </div>
          )}

          {/* Tags */}
          {business.tags && business.tags.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-neutral-800 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {business.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-neutral-100 text-neutral-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8 pt-6 border-t border-neutral-200">
            <button
              onClick={onBack}
              className="inline-flex items-center justify-center px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors font-medium"
            >
              ← Back to Directory
            </button>
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
