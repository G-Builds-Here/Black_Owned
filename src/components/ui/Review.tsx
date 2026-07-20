'use client';

import React from 'react';
import Card from './Card';
import Badge from './Badge';

export interface Review {
  id: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  date: string;
  title: string;
  content: string;
  isVerifiedPurchase?: boolean;
  helpfulCount?: number;
}

export interface ReviewListProps {
  reviews: Review[];
  averageRating: number;
  totalReviews: number;
}

/**
 * ReviewList - Displays customer reviews with ratings
 */
export function ReviewList({ reviews, averageRating, totalReviews }: ReviewListProps) {
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
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <div className="flex items-start gap-6 bg-neutral-50 p-6 rounded-lg">
        <div className="text-center">
          <div className="text-5xl font-bold text-neutral-800">{averageRating.toFixed(1)}</div>
          <div className="mt-2">{renderStars(averageRating)}</div>
          <div className="text-sm text-neutral-500 mt-1">Based on {totalReviews} reviews</div>
        </div>
        <div className="flex-1 space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = reviews.filter((r) => Math.round(r.rating) === star).length;
            const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-3">
                <span className="text-sm text-neutral-600 w-8">{star} ★</span>
                <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-heritage-ochre rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm text-neutral-500 w-12 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.map((review) => (
          <Card key={review.id} variant="elevated" padding="lg">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {review.reviewerAvatar ? (
                  <img
                    src={review.reviewerAvatar}
                    alt={`Avatar of ${review.reviewerName}`}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-heritage-ochre/20 flex items-center justify-center">
                    <span className="text-heritage-ochre font-semibold">
                      {review.reviewerName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-semibold text-neutral-800">{review.reviewerName}</h4>
                  <div className="flex items-center gap-2">
                    {renderStars(review.rating)}
                    {review.isVerifiedPurchase && (
                      <Badge variant="secondary" size="sm" className="bg-green-600 text-white">
                        ✓ Verified
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-neutral-500 mt-1">{formatDate(review.date)}</p>
                <h5 className="font-medium text-neutral-700 mt-3">{review.title}</h5>
                <p className="text-neutral-600 mt-2">{review.content}</p>
                {review.helpfulCount !== undefined && review.helpfulCount >= 0 && (
                  <button
                    className="mt-3 text-sm text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
                    aria-label={`${review.helpfulCount} people found this helpful`}
                  >
                    👍 Helpful ({review.helpfulCount})
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
