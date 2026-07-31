'use client';

import { useState, useEffect } from 'react';

export interface ResponsiveImageProps {
  src: string;
  alt: string;
  /** Mobile image width (for srcset generation) */
  mobileWidth?: number;
  /** Tablet image width */
  tabletWidth?: number;
  /** Desktop image width */
  desktopWidth?: number;
  /** Image quality (1-100) */
  quality?: number;
  /** Lazy loading preference */
  loading?: 'lazy' | 'eager';
  /** Object fit behavior */
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  /** Aspect ratio (e.g., '16/9', '4/3', '1/1') */
  aspectRatio?: string;
  className?: string;
  priority?: boolean;
}

/**
 * Responsive Image Component
 *
 * Optimizes images for mobile bandwidth by:
 * - Serving appropriately sized images based on viewport
 * - Using modern formats (WebP/AVIF) when supported
 * - Lazy loading off-screen images
 * - Providing fallback for older browsers
 */
export function ResponsiveImage({
  src,
  alt,
  mobileWidth = 400,
  tabletWidth = 800,
  desktopWidth = 1200,
  quality = 80,
  loading = 'lazy',
  objectFit = 'cover',
  aspectRatio,
  className = '',
  priority = false,
}: ResponsiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority || typeof window === 'undefined');

  useEffect(() => {
    if (priority || typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '50px',
        threshold: 0.1,
      }
    );

    const imgElement = document.querySelector(`[data-responsive-src="${src}"]`);
    if (imgElement) {
      observer.observe(imgElement);
    }

    return () => observer.disconnect();
  }, [src, priority]);

  // Generate srcset for responsive images
  const srcSet = `${src}?w=${mobileWidth}&q=${quality} ${mobileWidth}w,
    ${src}?w=${tabletWidth}&q=${quality} ${tabletWidth}w,
    ${src}?w=${desktopWidth}&q=${quality} ${desktopWidth}w`;

  const sizes = `(max-width: 640px) ${mobileWidth}px, (max-width: 1024px) ${tabletWidth}px, ${desktopWidth}px`;

  const aspectRatioStyle = aspectRatio
    ? {
        aspectRatio,
        width: '100%',
      }
    : {};

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={aspectRatioStyle}
    >
      {/* Loading placeholder */}
      {!isLoaded && (
        <div
          className="absolute inset-0 bg-neutral-200 animate-pulse"
          aria-hidden="true"
        />
      )}

      {/* Responsive image */}
      {isInView && (
        <picture>
          {/* WebP format support */}
          <source
            type="image/webp"
            srcSet={srcSet}
            sizes={sizes}
          />
          {/* AVIF format support (better compression) */}
          <source
            type="image/avif"
            srcSet={`${src}?w=${mobileWidth}&q=${quality}&format=avif ${mobileWidth}w,
              ${src}?w=${tabletWidth}&q=${quality}&format=avif ${tabletWidth}w,
              ${src}?w=${desktopWidth}&q=${quality}&format=avif ${desktopWidth}w`}
            sizes={sizes}
          />
          {/* Fallback for older browsers */}
          <img
            data-responsive-src={src}
            src={`${src}?w=${desktopWidth}&q=${quality}`}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            loading={loading}
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit,
              transition: 'opacity 0.3s ease-in-out',
              opacity: isLoaded ? 1 : 0,
            }}
          />
        </picture>
      )}
    </div>
  );
}

export default ResponsiveImage;
