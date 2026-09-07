'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from './FilterBar';

// Current component notes (source of truth: FilterBar.tsx):
// - No card chrome: the root div IS the control row (flex flex-wrap
//   items-center gap-2 p-3). The sticky white band is owned by the page.
// - Tabs render as a segmented pill control - "All Businesses (N)" /
//   "Saved (N)" - only when savedCount + onTabChange are provided.
// - A rounded search input (aria-label "Search businesses") renders when
//   onSearchChange is provided.
// - The filters are pill-styled Dropdown triggers labeled "Location",
//   "Category", "Rating", and the current sort label (default "Sort by").
// - The verified toggle is a Button labeled "All" (inactive) / "✓" (active).
// - The Clear button appears only when a filter or search text is active.

describe('FilterBar', () => {
  const mockCategories = ['Food & Dining', 'Professional Services', 'Retail'];
  const mockLocations = ['New York', 'Los Angeles', 'Chicago'];
  const base = {
    categories: mockCategories,
    locations: mockLocations,
    onFilterChange: jest.fn(),
    onSortChange: jest.fn(),
  };

  it('renders location filter label', () => {
    render(<FilterBar {...base} />);
    expect(screen.getByText(/location/i)).toBeInTheDocument();
  });

  it('renders category filter label', () => {
    render(<FilterBar {...base} />);
    expect(screen.getByText(/category/i)).toBeInTheDocument();
  });

  it('renders rating filter label', () => {
    render(<FilterBar {...base} />);
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });

  it('renders sort by label', () => {
    render(<FilterBar {...base} />);
    expect(screen.getByText(/sort by/i)).toBeInTheDocument();
  });

  it('renders verification toggle button', () => {
    render(<FilterBar {...base} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('toggles verified only filter', () => {
    const handleFilterChange = jest.fn();
    render(<FilterBar {...base} onFilterChange={handleFilterChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(handleFilterChange).toHaveBeenCalledWith({ verifiedOnly: true });
  });

  it('shows the checkmark when verified-only filter is active', () => {
    render(<FilterBar {...base} currentFilters={{ verifiedOnly: true }} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('calls onFilterChange when category is selected', () => {
    const handleFilterChange = jest.fn();
    render(<FilterBar {...base} onFilterChange={handleFilterChange} />);
    // Open the category dropdown (trigger shows the current value or "Category")
    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    // Select a category
    fireEvent.click(screen.getByText(/food & dining/i));
    expect(handleFilterChange).toHaveBeenCalledWith({ category: 'Food & Dining' });
  });

  it('calls onFilterChange when location is selected', () => {
    const handleFilterChange = jest.fn();
    render(<FilterBar {...base} onFilterChange={handleFilterChange} />);
    // Open the location dropdown
    fireEvent.click(screen.getByRole('button', { name: 'Location' }));
    // Select a location
    fireEvent.click(screen.getByText(/new york/i));
    expect(handleFilterChange).toHaveBeenCalledWith({ location: 'New York' });
  });

  it('calls onFilterChange when rating is selected', () => {
    const handleFilterChange = jest.fn();
    render(<FilterBar {...base} onFilterChange={handleFilterChange} />);
    // Open the rating dropdown
    fireEvent.click(screen.getByRole('button', { name: 'Rating' }));
    // Select a rating
    fireEvent.click(screen.getByText(/4\+ stars/i));
    expect(handleFilterChange).toHaveBeenCalledWith({ minRating: 4 });
  });

  it('calls onSortChange when sort option is selected', () => {
    const handleSortChange = jest.fn();
    render(<FilterBar {...base} onSortChange={handleSortChange} />);
    // Open the sort dropdown
    fireEvent.click(screen.getByRole('button', { name: /sort by/i }));
    // Select a sort option
    fireEvent.click(screen.getByText(/highest rated/i));
    expect(handleSortChange).toHaveBeenCalledWith('rating');
  });

  it('shows clear button when filters are active', () => {
    render(
      <FilterBar
        {...base}
        currentFilters={{ category: 'Food & Dining' }}
      />
    );
    expect(screen.getByText(/clear/i)).toBeInTheDocument();
  });

  it('does not show clear button when no filters are active', () => {
    render(<FilterBar {...base} />);
    expect(screen.queryByText(/clear/i)).not.toBeInTheDocument();
  });

  it('clears all filters when clear button is clicked', () => {
    const handleFilterChange = jest.fn();
    const handleSortChange = jest.fn();
    render(
      <FilterBar
        {...base}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
        currentFilters={{ category: 'Food & Dining' }}
        currentSort="rating"
      />
    );
    fireEvent.click(screen.getByText(/clear/i));
    expect(handleFilterChange).toHaveBeenCalledWith({});
    expect(handleSortChange).toHaveBeenCalledWith('relevance');
  });

  it('renders the search input when onSearchChange is provided', () => {
    render(<FilterBar {...base} onSearchChange={jest.fn()} />);
    expect(screen.getByLabelText('Search businesses')).toBeInTheDocument();
  });

  it('calls onSearchChange when the search input is typed', () => {
    const onSearchChange = jest.fn();
    render(<FilterBar {...base} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByLabelText('Search businesses'), {
      target: { value: 'soul' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('soul');
  });

  it('shows clear when search text is active', () => {
    render(<FilterBar {...base} search="soul" onSearchChange={jest.fn()} />);
    expect(screen.getByText(/clear/i)).toBeInTheDocument();
  });

  it('renders segmented tabs when savedCount and onTabChange are provided', () => {
    render(
      <FilterBar
        {...base}
        savedCount={5}
        activeTab="all"
        onTabChange={jest.fn()}
        filteredCount={13}
      />
    );
    expect(screen.getByText('All Businesses (13)')).toBeInTheDocument();
    expect(screen.getByText('Saved (5)')).toBeInTheDocument();
  });

  it('omits tabs and search when optional props are missing', () => {
    render(<FilterBar {...base} />);
    expect(screen.queryByText(/all businesses/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search businesses')).not.toBeInTheDocument();
  });

  it('is a single control row with no card chrome', () => {
    const { container } = render(<FilterBar {...base} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('flex-wrap');
    expect(root).toHaveClass('items-center');
    expect(root).toHaveClass('gap-2');
    expect(root).not.toHaveClass('rounded-lg');
    expect(root).not.toHaveClass('shadow-sm');
    expect(root).not.toHaveClass('border');
  });
});
