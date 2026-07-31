'use client';

import React from 'react';
import Link from 'next/link';
import Card from './Card';
import Badge from './Badge';
import Button from './Button';

export interface Business {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  location: string;
  isVerified: boolean;
  imageUrl: string;
  description: string;
  tags: string[];
}

export interface BusinessCardProps {
  business: Business;
  onViewDetails?: (businessId: string) => void;
  onSave?: (businessId: string) => void;
  onShare?: (businessId: string) => void;
  enableLink?: boolean;
}

/**
 * BusinessCard - Displays a business listing in the directory grid
 * Shows: image, name, category, rating, location, verification status, description
 */
export default function BusinessCard({
  business,
  onViewDetails,
  onSave,
  onShare,
  enableLink,
}: BusinessCardProps) {
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
        <span className="ml-2 text-sm text-neutral-600">({business.reviewCount})</span>
      </div>
    );
  };

  const handleViewDetails = () => {
    onViewDetails?.(business.id);
  };

  const handleSave = () => {
    onSave?.(business.id);
  };

  const handleShare = () => {
    onShare?.(business.id);
  };

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Image - Left side */}
        <div className="sm:w-48 flex-shrink-0 relative">
          {business.imageUrl ? (
            <img
              src={business.imageUrl}
              alt={`Business photo for ${business.name}`}
              className="w-full h-48 sm:h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-48 sm:h-full bg-neutral-200 flex items-center justify-center text-neutral-400">
              <span className="text-3xl">🏪</span>
            </div>
          )}

          {/* Verification Badge */}
          {business.isVerified && (
            <Badge
              variant="secondary"
              size="sm"
              className="absolute top-2 left-2 bg-green-600 text-white border-0"
            >
              ✓
            </Badge>
          )}
        </div>

        {/* Content - Right side */}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-neutral-800 mb-1">{business.name}</h3>
              <Badge variant="primary" size="sm">
                {business.category}
              </Badge>
              <div className="mt-2">{renderStars(business.rating)}</div>
              <p className="text-sm text-neutral-500 mt-1 flex items-center gap-1">
                <span aria-hidden="true">📍</span>
                {business.location || 'Location not available'}
              </p>
              <p className="text-sm text-neutral-600 mt-2 line-clamp-2">
                {business.description}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button variant="primary" size="sm" onClick={handleViewDetails}>
                View
              </Button>
              <Button variant="secondary" size="sm" onClick={handleSave} aria-label={`Save ${business.name}`}>
                📝
              </Button>
              <Button variant="ghost" size="sm" onClick={handleShare} aria-label={`Share ${business.name}`}>
                🔗
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
