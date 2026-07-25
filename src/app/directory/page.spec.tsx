'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from '@jest/globals';
import DirectoryPage from './page';

// Mock the NotificationProvider
jest.mock('@/components/ui/NotificationBanner', () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
  useNotification: () => ({
    showNotification: jest.fn(),
    setNotificationClickHandler: jest.fn(),
  }),
}));

// Mock the navigation
jest.mock('@/components/ui/Navigation', () => ({
  Navigation: ({ onNavigate }: { onNavigate: (section: string) => void }) => (
    <nav data-testid="navigation" onClick={() => onNavigate('home')}>
      Navigation
    </nav>
  ),
}));

// Mock the subscription functions
jest.mock('@/services/notification-service', () => ({
  subscribeToMessageEvents: jest.fn().mockResolvedValue(undefined),
  unsubscribeFromMessageEvents: jest.fn().mockResolvedValue(undefined),
}));

describe('Directory Page Responsive Grid', () => {
  it('displays grid with responsive columns at different viewport widths', () => {
    render(<DirectoryPage />);

    // Verify the page loads and displays businesses
    expect(screen.getByRole('heading', { name: /Business Directory/i })).toBeInTheDocument();
    expect(screen.getByText(/6 businesses found/i)).toBeInTheDocument();

    // Verify all 6 business cards are rendered (by heading level 3)
    const businessHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(businessHeadings).toHaveLength(6);

    // Verify the grid container has responsive Tailwind classes
    // lg:grid-cols-3 = 3 columns at 1200px+ (large)
    // md:grid-cols-2 = 2 columns at 800px+ (medium)
    // default = 1 column at <800px (small)
    const mainSection = screen.getByRole('main');
    const gridContainer = mainSection.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
    expect(gridContainer).toHaveClass('grid');
    expect(gridContainer).toHaveClass('md:grid-cols-2');
    expect(gridContainer).toHaveClass('lg:grid-cols-3');
    expect(gridContainer).toHaveClass('gap-6');
  });

  it('BusinessCard displays name, category, rating, and placeholder image', () => {
    render(<DirectoryPage />);

    // Check that business name is displayed
    expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();

    // Check that category is displayed
    expect(screen.getByText(/food & dining/i)).toBeInTheDocument();

    // Check that rating is displayed
    expect(screen.getByText(/\(156\)/i)).toBeInTheDocument();

    // Check that placeholder image is shown when no imageUrl (use getAllByText since there are 6 cards)
    const placeholderIcons = screen.getAllByText(/🏪/i);
    expect(placeholderIcons).toHaveLength(6);
  });
});
