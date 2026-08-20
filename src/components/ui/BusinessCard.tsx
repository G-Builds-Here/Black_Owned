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
      <div role="img" className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5 stars`}>
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
    <Card
      variant="elevated"
      padding="none"
      clickable
      className="h-full"
      as={enableLink ? Link : 'div'}
      href={enableLink ? `/business/${business.id}` : undefined}
    >
      <div className="flex h-full">
        {/* Image - Left side */}
        <div className="relative w-40 flex-shrink-0 overflow-hidden bg-neutral-200">
          {business.imageUrl ? (
            <img
              src={business.imageUrl}
              alt={`Business photo for ${business.name}`}
              className="w-full h-full object-cover"
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
              className="absolute top-2 left-2 bg-green-600 text-white border-0"
            >
              ✓<span className="sr-only">Verified</span>
            </Badge>
          )}
        </div>

        {/* Content - Right side */}
        <div className="flex flex-col flex-grow p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-lg font-semibold text-neutral-900 line-clamp-1">{business.name}</h3>
            <Badge variant="primary" size="sm">{business.category}</Badge>
          </div>

          {renderStars(business.rating)}

          <p className="text-sm text-neutral-700 mt-1 flex items-center gap-1">
            <span aria-hidden="true">📍</span>
            {business.location}
          </p>

          <p className="text-sm text-neutral-700 mt-2 line-clamp-2 flex-grow">
            {business.description}
          </p>

          {/* Tags */}
          {business.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {business.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="default" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-neutral-200">
            <Button variant="primary" size="sm" onClick={handleViewDetails} className="min-w-0 px-3">
              View Details
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSave} aria-label={`Save ${business.name}`} className="min-w-0 px-2">
              💾
            </Button>
            <Button variant="ghost" size="sm" onClick={handleShare} aria-label={`Share ${business.name}`} className="min-w-0 px-2">
              🔗
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
