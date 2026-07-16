'use client';

import React from 'react';
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
    <Card variant="elevated" padding="none" clickable className="h-full flex flex-col">
      {/* Image */}
      <div className="relative aspect-video overflow-hidden rounded-t-lg bg-neutral-200">
        {business.imageUrl ? (
          <img
            src={business.imageUrl}
            alt={`Business photo for ${business.name}`}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400">
            <span className="text-4xl">🏪</span>
          </div>
        )}

        {/* Verification Badge */}
        {business.isVerified && (
          <Badge
            variant="secondary"
            size="sm"
            className="absolute top-3 left-3 bg-green-600 text-white border-0"
          >
            ✓ Verified
          </Badge>
        )}

        {/* Category Badge */}
        <Badge variant="primary" size="sm" className="absolute top-3 right-3">
          {business.category}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-grow p-4">
        <h3 className="text-xl font-semibold mb-2 text-neutral-800">{business.name}</h3>

        {renderStars(business.rating)}

        <p className="text-sm text-neutral-500 mt-2 flex items-center gap-1">
          <span aria-hidden="true">📍</span>
          {business.location}
        </p>

        <p className="text-sm text-neutral-600 mt-3 line-clamp-2 flex-grow">
          {business.description}
        </p>

        {/* Tags */}
        {business.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {business.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="default" size="sm">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-200">
          <Button variant="primary" size="sm" onClick={handleViewDetails} className="flex-1">
            View Details
          </Button>
          <Button variant="secondary" size="sm" onClick={handleSave} aria-label={`Save ${business.name}`}>
            💾
          </Button>
          <Button variant="ghost" size="sm" onClick={handleShare} aria-label={`Share ${business.name}`}>
            🔗
          </Button>
        </div>
      </div>
    </Card>
  );
}
