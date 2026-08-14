'use client';

import React, { useState } from 'react';
import Dropdown, { DropdownItem } from './Dropdown';
import Input from './Input';
import Button from './Button';

export type SortOption = 'relevance' | 'rating' | 'distance' | 'newest';
export type FilterOption = {
  category?: string;
  minRating?: number;
  location?: string;
  verifiedOnly?: boolean;
};

export interface FilterBarProps {
  categories: string[];
  locations: string[];
  onFilterChange: (filters: FilterOption) => void;
  onSortChange: (sort: SortOption) => void;
  currentSort?: SortOption;
  currentFilters?: FilterOption;
}

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Sort by', value: 'relevance' },
  { label: 'Highest Rated', value: 'rating' },
  { label: 'Nearest', value: 'distance' },
  { label: 'Newest', value: 'newest' },
];

const RATING_FILTERS: { label: string; value: number }[] = [
  { label: 'Any Rating', value: 0 },
  { label: '4+ Stars', value: 4 },
  { label: '4.5+ Stars', value: 4.5 },
  { label: '5 Stars', value: 5 },
];

/**
 * FilterBar - Provides filtering and sorting controls for business listings
 * Supports: category filter, rating filter, location filter, verified toggle, sort dropdown
 */
export default function FilterBar({
  categories,
  locations,
  onFilterChange,
  onSortChange,
  currentSort = 'relevance',
  currentFilters = {},
}: FilterBarProps) {
  const [localFilters, setLocalFilters] = useState<FilterOption>(currentFilters);

  const handleCategoryChange = (category: string) => {
    const newFilters = { ...localFilters, category: category || undefined };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleLocationChange = (location: string) => {
    const newFilters = { ...localFilters, location: location || undefined };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleRatingChange = (rating: number) => {
    const newFilters = { ...localFilters, minRating: rating || undefined };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleVerifiedToggle = () => {
    const newFilters = { ...localFilters, verifiedOnly: !localFilters.verifiedOnly };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleSortChange = (sort: string) => {
    onSortChange(sort as SortOption);
  };

  const clearFilters = () => {
    const emptyFilters: FilterOption = {};
    setLocalFilters(emptyFilters);
    onFilterChange(emptyFilters);
    onSortChange('relevance');
  };

  const hasActiveFilters =
    localFilters.category ||
    localFilters.minRating ||
    localFilters.location ||
    localFilters.verifiedOnly;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-3 mb-4">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Category Filter */}
        <div className="flex-1 min-w-[200px]">
          <Dropdown
            trigger={localFilters.category || 'Category'}
            items={[
              { label: 'All Categories', key: '', onClick: () => handleCategoryChange('') },
              ...categories.map((cat) => ({ label: cat, key: cat, onClick: () => handleCategoryChange(cat) })),
            ]}
          />
        </div>

        {/* Location Filter */}
        <div className="flex-1 min-w-[200px]">
          <Dropdown
            trigger={localFilters.location || 'Location'}
            items={[
              { label: 'All Locations', key: '', onClick: () => handleLocationChange('') },
              ...locations.map((loc) => ({ label: loc, key: loc, onClick: () => handleLocationChange(loc) })),
            ]}
          />
        </div>

        {/* Rating Filter */}
        <div className="flex-1 min-w-[150px]">
          <Dropdown
            trigger={localFilters.minRating ? `${localFilters.minRating}+ Stars` : 'Rating'}
            items={RATING_FILTERS.map((r) => ({
              label: r.label,
              key: r.value.toString(),
              onClick: () => handleRatingChange(r.value),
            }))}
          />
        </div>

        {/* Verified Only Toggle */}
        <Button
          variant={localFilters.verifiedOnly ? 'primary' : 'secondary'}
          size="md"
          onClick={handleVerifiedToggle}
        >
          {localFilters.verifiedOnly ? '✓ Verified Only' : 'All Businesses'}
        </Button>

        {/* Sort Dropdown */}
        <div className="flex-1 min-w-[140px]">
          <Dropdown
            trigger={SORT_OPTIONS.find((s) => s.value === currentSort)?.label || 'Sort'}
            items={SORT_OPTIONS.map((s) => ({
              label: s.label,
              key: s.value,
              onClick: () => handleSortChange(s.value),
            }))}
          />
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear All
          </Button>
        )}
      </div>
    </div>
  );
}
