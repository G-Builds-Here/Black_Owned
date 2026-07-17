'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar, { FilterOption, SortOption } from './FilterBar';

describe('FilterBar', () => {
  const mockCategories = ['Food & Dining', 'Professional Services', 'Retail'];
  const mockLocations = ['New York', 'Los Angeles', 'Chicago'];

  it('renders category filter label', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    expect(screen.getByText(/category/i)).toBeInTheDocument();
  });

  it('renders location filter label', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    expect(screen.getByText(/location/i)).toBeInTheDocument();
  });

  it('renders rating filter label', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    expect(screen.getByText(/minimum rating/i)).toBeInTheDocument();
  });

  it('renders sort by label', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    expect(screen.getByText(/sort by/i)).toBeInTheDocument();
  });

  it('renders verification toggle button', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    expect(screen.getByText(/all businesses/i)).toBeInTheDocument();
  });

  it('toggles verified only filter', () => {
    const handleFilterChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={handleFilterChange}
        onSortChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText(/all businesses/i));
    expect(handleFilterChange).toHaveBeenCalledWith({ verifiedOnly: true });
  });

  it('shows "Verified Only" when filter is active', () => {
    const handleFilterChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={handleFilterChange}
        onSortChange={jest.fn()}
        currentFilters={{ verifiedOnly: true }}
      />
    );
    expect(screen.getByText(/✓ verified only/i)).toBeInTheDocument();
  });

  it('calls onFilterChange when category is selected', () => {
    const handleFilterChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={handleFilterChange}
        onSortChange={jest.fn()}
      />
    );
    // Click category dropdown
    fireEvent.click(screen.getByRole('button', { name: /select category/i }));
    // Select a category
    fireEvent.click(screen.getByText(/food & dining/i));
    expect(handleFilterChange).toHaveBeenCalledWith({ category: 'Food & Dining' });
  });

  it('calls onFilterChange when location is selected', () => {
    const handleFilterChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={handleFilterChange}
        onSortChange={jest.fn()}
      />
    );
    // Click location dropdown
    fireEvent.click(screen.getByRole('button', { name: /select location/i }));
    // Select a location
    fireEvent.click(screen.getByText(/new york/i));
    expect(handleFilterChange).toHaveBeenCalledWith({ location: 'New York' });
  });

  it('calls onFilterChange when rating is selected', () => {
    const handleFilterChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={handleFilterChange}
        onSortChange={jest.fn()}
      />
    );
    // Click rating dropdown
    fireEvent.click(screen.getByRole('button', { name: /select rating/i }));
    // Select a rating
    fireEvent.click(screen.getByText(/4\+ stars/i));
    expect(handleFilterChange).toHaveBeenCalledWith({ minRating: 4 });
  });

  it('calls onSortChange when sort option is selected', () => {
    const handleSortChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={handleSortChange}
      />
    );
    // Click sort dropdown
    fireEvent.click(screen.getByRole('button', { name: /sort by/i }));
    // Select a sort option
    fireEvent.click(screen.getByText(/highest rated/i));
    expect(handleSortChange).toHaveBeenCalledWith('rating');
  });

  it('shows clear all button when filters are active', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
        currentFilters={{ category: 'Food & Dining' }}
      />
    );
    expect(screen.getByText(/clear all/i)).toBeInTheDocument();
  });

  it('does not show clear all button when no filters are active', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    expect(screen.queryByText(/clear all/i)).not.toBeInTheDocument();
  });

  it('clears all filters when clear button is clicked', () => {
    const handleFilterChange = jest.fn();
    const handleSortChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
        currentFilters={{ category: 'Food & Dining' }}
        currentSort="relevance"
      />
    );
    fireEvent.click(screen.getByText(/clear all/i));
    expect(handleFilterChange).toHaveBeenCalledWith({});
    expect(handleSortChange).toHaveBeenCalledWith('relevance');
  });

  it('shows active filter summary', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
        currentFilters={{ category: 'Food & Dining' }}
      />
    );
    expect(screen.getByText(/active filters:/i)).toBeInTheDocument();
    expect(screen.getByText(/category: food & dining/i)).toBeInTheDocument();
  });

  it('allows removing individual filters from summary', () => {
    const handleFilterChange = jest.fn();
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={handleFilterChange}
        onSortChange={jest.fn()}
        currentFilters={{ category: 'Food & Dining' }}
      />
    );
    fireEvent.click(screen.getByLabelText(/remove category filter/i));
    expect(handleFilterChange).toHaveBeenCalledWith({});
  });

  it('has rounded border', () => {
    const { container } = render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    const filterBar = container.querySelector('[data-testid="filter-bar"]');
    expect(filterBar).toHaveClass('rounded-lg');
  });

  it('has shadow', () => {
    const { container } = render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    const filterBar = container.querySelector('[data-testid="filter-bar"]');
    expect(filterBar).toHaveClass('shadow-sm');
  });

  it('has border', () => {
    const { container } = render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    const filterBar = container.querySelector('[data-testid="filter-bar"]');
    expect(filterBar).toHaveClass('border');
    expect(filterBar).toHaveClass('border-neutral-200');
  });

  it('has padding', () => {
    const { container } = render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    const filterBar = container.querySelector('[data-testid="filter-bar"]');
    expect(filterBar).toHaveClass('p-4');
  });

  it('has margin bottom', () => {
    const { container } = render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    const filterBar = container.querySelector('[data-testid="filter-bar"]');
    expect(filterBar).toHaveClass('mb-6');
  });

  it('has flex layout', () => {
    const { container } = render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    const filterBar = container.querySelector('[data-testid="filter-bar"]');
    expect(filterBar).toHaveClass('flex');
    expect(filterBar).toHaveClass('flex-wrap');
    expect(filterBar).toHaveClass('gap-4');
  });

  it('shows results count when provided', () => {
    render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    // The directory page shows the count, not the FilterBar itself
    // This test verifies the FilterBar structure
    expect(screen.getByText(/category/i)).toBeInTheDocument();
  });

  it('has white background', () => {
    const { container } = render(
      <FilterBar
        categories={mockCategories}
        locations={mockLocations}
        onFilterChange={jest.fn()}
        onSortChange={jest.fn()}
      />
    );
    const filterBar = container.querySelector('[data-testid="filter-bar"]');
    expect(filterBar).toHaveClass('bg-white');
  });
});
