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
  savedCount?: number;
  activeTab?: 'all' | 'saved';
  onTabChange?: (tab: 'all' | 'saved') => void;
  filteredCount?: number;
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
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
      {/* Tabs */}
      {savedCount !== undefined && onTabChange && (
        <div className="border-b border-neutral-200 px-3">
          <div className="flex gap-4">
            <button
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'all'
                  ? 'border-heritage-ochre text-heritage-ochre'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
              onClick={() => onTabChange('all')}
            >
              All Businesses ({filteredCount ?? 0})
            </button>
            <button
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'saved'
                  ? 'border-heritage-ochre text-heritage-ochre'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
              onClick={() => onTabChange('saved')}
            >
              Saved ({savedCount})
            </button>
          </div>
        </div>
      )}
      <div className="p-3 flex flex-wrap gap-2 items-center">
        {/* Category Filter */}
        <div className="min-w-[160px]">
          <Dropdown
            trigger={localFilters.category || 'Category'}
            items={[
              { label: 'All Categories', key: '', onClick: () => handleCategoryChange('') },
              ...categories.map((cat) => ({ label: cat, key: cat, onClick: () => handleCategoryChange(cat) })),
            ]}
          />
        </div>

        {/* Location Filter */}
        <div className="min-w-[160px]">
          <Dropdown
            trigger={localFilters.location || 'Location'}
            items={[
              { label: 'All Locations', key: '', onClick: () => handleLocationChange('') },
              ...locations.map((loc) => ({ label: loc, key: loc, onClick: () => handleLocationChange(loc) })),
            ]}
          />
        </div>

        {/* Rating Filter */}
        <div className="min-w-[130px]">
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
          size="sm"
          onClick={handleVerifiedToggle}
          className="px-3"
        >
          {localFilters.verifiedOnly ? '✓' : 'All'}
        </Button>

        {/* Sort Dropdown */}
        <div className="min-w-[130px]">
          <Dropdown
            trigger={SORT_OPTIONS.find((s) => s.value === currentSort)?.label || 'Sort by'}
            items={SORT_OPTIONS.map((s) => ({
              label: s.label,
              key: s.value,
              onClick: () => handleSortChange(s.value),
            }))}
          />
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="px-2">
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
