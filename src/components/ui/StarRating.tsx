'use client';

import React, { HTMLAttributes, forwardRef, useState } from 'react';

export interface StarRatingProps extends HTMLAttributes<HTMLDivElement> {
  /** Rating value (0-5) */
  rating: number;
  /** Maximum rating value */
  maxRating?: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show rating text */
  showRating?: boolean;
  /** Total reviews count */
  reviewCount?: number;
  /** Read-only or interactive */
  interactive?: boolean;
  /** On rating change handler (for interactive mode) */
  onRatingChange?: (rating: number) => void;
  /** Custom star icon */
  starIcon?: {
    filled: React.ReactNode;
    empty: React.ReactNode;
    half: React.ReactNode;
  };
}

const DEFAULT_STAR_ICON = {
  filled: <span aria-hidden="true">★</span>,
  empty: <span aria-hidden="true">☆</span>,
  half: <span aria-hidden="true">★</span>,
};

const sizeStyles = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
};

/**
 * StarRating - Displays and allows rating input with star icons
 * Supports both display-only and interactive modes
 * Fully accessible with ARIA labels and keyboard navigation
 */
export const StarRating = forwardRef<HTMLDivElement, StarRatingProps>(
  (
    {
      rating,
      maxRating = 5,
      size = 'md',
      showRating = true,
      reviewCount,
      interactive = false,
      onRatingChange,
      starIcon = DEFAULT_STAR_ICON,
      className = '',
      ...props
    },
    ref
  ) => {
    const [hoverRating, setHoverRating] = useState(0);

    const displayRating = hoverRating || rating;

    const handleMouseEnter = (index: number) => {
      if (interactive) {
        setHoverRating(index);
      }
    };

    const handleMouseLeave = () => {
      if (interactive) {
        setHoverRating(0);
      }
    };

    const handleClick = (index: number) => {
      if (interactive && onRatingChange) {
        onRatingChange(index);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
      if (!interactive) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick(index);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleClick(Math.min(index + 1, maxRating));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleClick(Math.max(index - 1, 1));
      }
    };

    const getStarState = (index: number) => {
      if (displayRating >= index) {
        return 'filled';
      }
      if (displayRating >= index - 0.5) {
        return 'half';
      }
      return 'empty';
    };

    return (
      <div
        ref={ref}
        className={`flex items-center gap-1 ${className}`}
        role={interactive ? 'radiogroup' : 'img'}
        aria-label={interactive ? 'Rate this item' : `Rating: ${rating} out of ${maxRating} stars`}
        {...props}
      >
        {[...Array(maxRating)].map((_, index) => {
          const starState = getStarState(index + 1);
          const starValue = index + 1;

          return (
            <button
              key={index}
              type="button"
              className={`${sizeStyles[size]} ${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'} ${starState === 'filled' ? 'text-heritage-ochre' : starState === 'half' ? 'text-heritage-ochre/50' : 'text-neutral-300'}`}
              onMouseEnter={() => handleMouseEnter(starValue)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleClick(starValue)}
              onKeyDown={(e) => handleKeyDown(e, starValue)}
              disabled={!interactive}
              role={interactive ? 'radio' : undefined}
              aria-checked={interactive ? rating === starValue : undefined}
              aria-label={`${starValue} star${starValue > 1 ? 's' : ''}`}
            >
              {starState === 'filled' && starIcon.filled}
              {starState === 'half' && starIcon.half}
              {starState === 'empty' && starIcon.empty}
            </button>
          );
        })}

        {showRating && (
          <span className="ml-2 text-sm text-neutral-600">
            {rating.toFixed(1)}
            {reviewCount !== undefined && <span className="ml-1">({reviewCount})</span>}
          </span>
        )}
      </div>
    );
  }
);

StarRating.displayName = 'StarRating';

export default StarRating;
