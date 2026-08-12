'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminConsole from './page';

// Mock all UI components that have external dependencies
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  return {
    ...actual,
    UserTable: () => <div data-testid="user-table-mock">User Table Mock</div>,
  };
});

describe('AdminConsole - Source Filter', () => {
  it('displays source filter dropdown with all options', () => {
    render(<AdminConsole />);
    expect(screen.getByText(/all sources/i)).toBeInTheDocument();
    expect(screen.getByText(/google maps/i)).toBeInTheDocument();
    expect(screen.getByText(/yelp/i)).toBeInTheDocument();
    expect(screen.getByText(/facebook/i)).toBeInTheDocument();
  });

  it('shows "All Sources" as default selected source', () => {
    render(<AdminConsole />);
    expect(screen.getByText(/all sources/i)).toHaveTextContent('All Sources');
  });

  it('displays total businesses count for selected source', () => {
    render(<AdminConsole />);
    // Default (all sources) should show 1,247
    expect(screen.getByText(/1,247/i)).toBeInTheDocument();
  });

  it('filters total businesses when Google Maps is selected', () => {
    render(<AdminConsole />);
    // Open the source filter dropdown
    fireEvent.click(screen.getByRole('button', { name: /all sources/i }));
    // Select Google Maps from dropdown
    fireEvent.click(screen.getByRole('menuitem', { name: /google maps/i }));
    // Verify filter label updated
    expect(screen.getByRole('button', { name: /google maps/i })).toBeInTheDocument();
    // Should show Google Maps total: 542
    const googleMapsCounts = screen.getAllByText(/542/i);
    expect(googleMapsCounts.length).toBeGreaterThan(0);
  });

  it('filters total businesses when Yelp is selected', () => {
    render(<AdminConsole />);
    // Open the source filter dropdown
    fireEvent.click(screen.getByRole('button', { name: /all sources/i }));
    // Select Yelp from dropdown
    fireEvent.click(screen.getByRole('menuitem', { name: /yelp/i }));
    // Verify filter label updated
    expect(screen.getByRole('button', { name: /yelp/i })).toBeInTheDocument();
    // Should show Yelp total: 438
    const yelpCounts = screen.getAllByText(/438/i);
    expect(yelpCounts.length).toBeGreaterThan(0);
  });

  it('filters total businesses when Facebook is selected', () => {
    render(<AdminConsole />);
    // Open the source filter dropdown
    fireEvent.click(screen.getByRole('button', { name: /all sources/i }));
    // Select Facebook from dropdown
    fireEvent.click(screen.getByRole('menuitem', { name: /facebook/i }));
    // Verify filter label updated
    expect(screen.getByRole('button', { name: /facebook/i })).toBeInTheDocument();
    // Should show Facebook total: 267
    const facebookCounts = screen.getAllByText(/267/i);
    expect(facebookCounts.length).toBeGreaterThan(0);
  });

  it('updates source filter label when changed', () => {
    render(<AdminConsole />);
    // Initially shows "All Sources"
    expect(screen.getByRole('button', { name: /all sources/i })).toBeInTheDocument();
    // Open dropdown and select Google Maps
    fireEvent.click(screen.getByRole('button', { name: /all sources/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /google maps/i }));
    // Label should update to show selected source
    expect(screen.getByRole('button', { name: /google maps/i })).toBeInTheDocument();
  });

  it('shows correct percentage for filtered source', () => {
    render(<AdminConsole />);
    // When all sources selected, Google Maps should show 43.5% (542/1247)
    fireEvent.click(screen.getByRole('button', { name: /all sources/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /google maps/i }));
    // When filtered to Google Maps only, it should show 100%
    expect(screen.getByText(/100\.0%/i)).toBeInTheDocument();
  });
});
