'use client';

import { ReactNode, useEffect, useState } from 'react';

// Type declaration for safe area insets (iOS, modern Android)
declare global {
  interface Window {
    safeAreaInsetTop?: number;
    safeAreaInsetBottom?: number;
    safeAreaInsetLeft?: number;
    safeAreaInsetRight?: number;
  }
}

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface BreakpointState {
  current: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
}

export interface MobileResponsiveContainerProps {
  children: ReactNode;
  mobileNav?: ReactNode;
  className?: string;
}

/**
 * Mobile Responsive Container
 *
 * Provides responsive layout context and manages mobile-specific behaviors:
 * - Detects viewport breakpoints
 * - Injects mobile bottom navigation when appropriate
 * - Manages safe area insets for notched devices
 * - Handles orientation changes
 */
export function MobileResponsiveContainer({
  children,
  mobileNav,
  className = '',
}: MobileResponsiveContainerProps) {
  const [breakpoint, setBreakpoint] = useState<BreakpointState>({
    current: 'md',
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getBreakpoint = (): Breakpoint => {
      const width = window.innerWidth;
      if (width < 640) return 'xs';
      if (width < 768) return 'sm';
      if (width < 1024) return 'md';
      if (width < 1280) return 'lg';
      if (width < 1536) return 'xl';
      return '2xl';
    };

    const updateBreakpoint = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const current = getBreakpoint();

      setBreakpoint({
        current,
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        width,
        height,
      });
    };

    // Initial measurement
    updateBreakpoint();

    // Debounced resize handler
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateBreakpoint, 150);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Handle safe area insets for notched devices (iOS, modern Android)
    const updateSafeArea = () => {
      const safeAreaTop = window.safeAreaInsetTop ||
        parseFloat(getComputedStyle(document.documentElement)
          .getPropertyValue('--safe-area-inset-top')) || 0;
      const safeAreaBottom = window.safeAreaInsetBottom ||
        parseFloat(getComputedStyle(document.documentElement)
          .getPropertyValue('--safe-area-inset-bottom')) || 0;

      document.documentElement.style.setProperty('--safe-area-top', `${safeAreaTop}px`);
      document.documentElement.style.setProperty('--safe-area-bottom', `${safeAreaBottom}px`);
    };

    updateSafeArea();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  return (
    <div
      className={`mobile-responsive-container ${className}`}
      data-breakpoint={breakpoint.current}
      data-mobile={breakpoint.isMobile}
      data-tablet={breakpoint.isTablet}
      data-desktop={breakpoint.isDesktop}
    >
      {/* Main content area */}
      <main className={`${breakpoint.isMobile ? 'pb-16' : ''}`}>
        {children}
      </main>

      {/* Mobile bottom navigation - shown only on mobile */}
      {breakpoint.isMobile && mobileNav && (
        <div className="mobile-bottom-nav-wrapper">
          {mobileNav}
        </div>
      )}
    </div>
  );
}

export default MobileResponsiveContainer;
