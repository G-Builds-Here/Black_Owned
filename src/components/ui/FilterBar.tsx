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
  showUnclaimedOnly?: boolean;
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
  { label: 'Relevance', value: 'relevance' },
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

  const handleStatusChange = (value: string) => {
    const newFilters: FilterOption = { ...localFilters };
    if (value === 'unclaimed') {
      newFilters.showUnclaimedOnly = true;
      delete newFilters.verifiedOnly;
    } else if (value === 'verified') {
      newFilters.verifiedOnly = true;
      delete newFilters.showUnclaimedOnly;
    } else {
      delete newFilters.showUnclaimedOnly;
      delete newFilters.verifiedOnly;
    }
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const getDisplayStatus = (): string => {
    if (localFilters.showUnclaimedOnly) return '📋 Unclaimed';
    if (localFilters.verifiedOnly) return '✓ Verified';
    return 'Status';
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
    localFilters.verifiedOnly ||
    localFilters.showUnclaimedOnly;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Status Filter - Combined (Unclaimed/Verified/All) */}
      <Dropdown
        trigger={getDisplayStatus()}
        items={[
          { label: 'All Listings', key: 'all', onClick: () => handleStatusChange('all') },
          { label: '📋 Unclaimed', key: 'unclaimed', onClick: () => handleStatusChange('unclaimed') },
          { label: '✓ Verified', key: 'verified', onClick: () => handleStatusChange('verified') },
        ]}
        triggerClassName="h-[46px] px-4 py-2.5 rounded-lg border border-neutral-300 bg-white hover:border-heritage-ochre transition-colors"
      />

      {/* Category Filter */}
      <Dropdown
        trigger={localFilters.category || 'Category'}
        items={[
          { label: 'All Categories', key: '', onClick: () => handleCategoryChange('') },
          ...categories.map((cat) => ({ label: cat, key: cat, onClick: () => handleCategoryChange(cat) })),
        ]}
        triggerClassName="h-[46px] px-4 py-2.5 rounded-lg border border-neutral-300 bg-white hover:border-heritage-ochre transition-colors"
      />

      {/* Location Filter */}
      <Dropdown
        trigger={localFilters.location || 'Location'}
        items={[
          { label: 'All Locations', key: '', onClick: () => handleLocationChange('') },
          ...locations.map((loc) => ({ label: loc, key: loc, onClick: () => handleLocationChange(loc) })),
        ]}
        triggerClassName="h-[46px] px-4 py-2.5 rounded-lg border border-neutral-300 bg-white hover:border-heritage-ochre transition-colors"
      />

      {/* Rating Filter */}
      <Dropdown
        trigger={localFilters.minRating ? `${localFilters.minRating}+ Stars` : 'Min Rating'}
        items={RATING_FILTERS.map((r) => ({
          label: r.label,
          key: r.value.toString(),
          onClick: () => handleRatingChange(r.value),
        }))}
        triggerClassName="h-[46px] px-4 py-2.5 rounded-lg border border-neutral-300 bg-white hover:border-heritage-ochre transition-colors"
      />

      {/* Sort By Dropdown */}
      <Dropdown
        trigger={currentSort !== 'relevance' ? SORT_OPTIONS.find((s) => s.value === currentSort)?.label || 'Sort By' : 'Sort By'}
        items={SORT_OPTIONS.map((s) => ({
          label: s.label,
          key: s.value,
          onClick: () => handleSortChange(s.value),
        }))}
        triggerClassName="h-[46px] px-4 py-2.5 rounded-lg border border-neutral-300 bg-white hover:border-heritage-ochre transition-colors"
      />

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-[46px]">
          Clear All
        </Button>
      )}
    </div>
  );
}
