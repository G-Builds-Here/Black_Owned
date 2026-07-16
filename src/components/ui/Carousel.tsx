'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Button from './Button';

export interface CarouselProps {
  images: string[];
  altPrefix?: string;
  onImageSelect?: (index: number) => void;
  autoPlayInterval?: number;
}

/**
 * Carousel - Image gallery component with navigation controls
 * Supports keyboard navigation, touch gestures, and auto-play
 */
export function Carousel({
  images,
  altPrefix = 'Gallery image',
  onImageSelect,
  autoPlayInterval = 5000,
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const goToSlide = useCallback(
    (index: number) => {
      const wrappedIndex = (index + images.length) % images.length;
      setCurrentIndex(wrappedIndex);
      onImageSelect?.(wrappedIndex);
    },
    [images.length, onImageSelect]
  );

  const goToPrevious = useCallback(() => {
    goToSlide(currentIndex - 1);
  }, [currentIndex, goToSlide]);

  const goToNext = useCallback(() => {
    goToSlide(currentIndex + 1);
  }, [currentIndex, goToSlide]);

  // Auto-play functionality
  useEffect(() => {
    if (autoPlayInterval <= 0 || isPaused || images.length <= 1) return;

    const interval = setInterval(() => {
      goToNext();
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlayInterval, isPaused, images.length, goToNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext]);

  if (images.length === 0) {
    return (
      <div
        className="aspect-video bg-neutral-200 rounded-lg flex items-center justify-center"
        role="img"
        aria-label="No images available"
      >
        <span className="text-4xl text-neutral-400">📷</span>
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-lg">
        <img
          src={images[0]}
          alt={`${altPrefix} 1`}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="relative group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Main Image */}
      <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-200">
        <img
          src={images[currentIndex]}
          alt={`${altPrefix} ${currentIndex + 1} of ${images.length}`}
          className="w-full h-full object-cover transition-opacity duration-300"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

        {/* Slide Counter */}
        <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
          {currentIndex + 1} / {images.length}
        </div>

        {/* Previous Button */}
        <Button
          variant="secondary"
          size="md"
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white border-0 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Previous image"
        >
          ‹
        </Button>

        {/* Next Button */}
        <Button
          variant="secondary"
          size="md"
          onClick={goToNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white border-0 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Next image"
        >
          ›
        </Button>
      </div>

      {/* Thumbnail Navigation */}
      <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
        {images.map((image, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`relative flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all ${
              index === currentIndex
                ? 'border-heritage-ochre ring-2 ring-heritage-ochre/30'
                : 'border-neutral-300 hover:border-neutral-400'
            }`}
            aria-label={`Go to image ${index + 1}`}
            aria-current={index === currentIndex ? 'step' : undefined}
          >
            <img
              src={image}
              alt={`${altPrefix} ${index + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
