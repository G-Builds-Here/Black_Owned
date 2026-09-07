'use client';

import React, { useState } from 'react';
import Dropdown, { DropdownItem } from './Dropdown';
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
  /** Controlled search text */
  search?: string;
  onSearchChange?: (value: string) => void;
}

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Sort by', value: 'relevance' },
  { label: 'Highest rated', value: 'rating' },
  { label: 'Closest', value: 'distance' },
  { label: 'Newest', value: 'newest' },
];

const RATING_FILTERS: { label: string; value: number }[] = [
  { label: 'Any rating', value: 0 },
  { label: '3+ Stars', value: 3 },
  { label: '4+ Stars', value: 4 },
  { label: '4.5+ Stars', value: 4.5 },
];

/**
 * Pill styling for filter triggers. Active filters get the heritage-ochre
 * accent; inactive ones are neutral.
 */
const pillClass = (active: boolean) =>
  `min-h-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? 'border-heritage-ochre bg-heritage-ochre text-white'
      : 'border-neutral-300 bg-white text-neutral-800 hover:border-heritage-ochre'
  }`;

/**
 * FilterBar - OpenTable-style single control row.
 *
 * One full-width row: segmented tabs, search input, then pill filters
 * (location, category, rating, verified) and sort. No card chrome around
 * the row — the page provides the sticky white band.
 */
export default function FilterBar({
  categories,
  locations,
  onFilterChange,
  onSortChange,
  currentSort = 'relevance',
  currentFilters = {},
  savedCount,
  onTabChange,
  activeTab = 'all',
  filteredCount,
  search = '',
  onSearchChange,
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
    if (onSearchChange) onSearchChange('');
  };

  const hasActiveFilters =
    localFilters.category ||
    localFilters.minRating ||
    localFilters.location ||
    localFilters.verifiedOnly;

  const showTabs = savedCount !== undefined && onTabChange;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Tabs - segmented control */}
      {showTabs && (
        <div className="flex items-center rounded-full border border-neutral-300 bg-white p-0.5">
          <button
            type="button"
            className={`min-h-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-heritage-ochre text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
            onClick={() => onTabChange('all')}
          >
            All Businesses ({filteredCount ?? 0})
          </button>
          <button
            type="button"
            className={`min-h-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'saved'
                ? 'bg-heritage-ochre text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
            onClick={() => onTabChange('saved')}
          >
            Saved ({savedCount})
          </button>
        </div>
      )}

      {/* Search */}
      {onSearchChange && (
        <div className="relative w-64 min-w-[180px]">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400"
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search businesses…"
            aria-label="Search businesses"
            className="w-full rounded-full border border-neutral-300 bg-white py-1.5 pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-heritage-ochre focus:outline-none"
          />
        </div>
      )}

      {/* Location Filter */}
      <div>
        <Dropdown
          trigger={localFilters.location || 'Location'}
          triggerClassName={pillClass(!!localFilters.location)}
          items={[
            { label: 'All Locations', key: '', onClick: () => handleLocationChange('') },
            ...locations.map((loc) => ({ label: loc, key: loc, onClick: () => handleLocationChange(loc) })),
          ]}
        />
      </div>

      {/* Category Filter */}
      <div>
        <Dropdown
          trigger={localFilters.category || 'Category'}
          triggerClassName={pillClass(!!localFilters.category)}
          items={[
            { label: 'All Categories', key: '', onClick: () => handleCategoryChange('') },
            ...categories.map((cat) => ({ label: cat, key: cat, onClick: () => handleCategoryChange(cat) })),
          ]}
        />
      </div>

      {/* Rating Filter */}
      <div>
        <Dropdown
          trigger={localFilters.minRating ? `${localFilters.minRating}+ Stars` : 'Rating'}
          triggerClassName={pillClass(!!localFilters.minRating)}
          items={RATING_FILTERS.map((r) => ({
            label: r.label,
            key: r.value.toString(),
            onClick: () => handleRatingChange(r.value),
          }))}
        />
      </div>

      {/* Sort Dropdown */}
      <div>
        <Dropdown
          trigger={SORT_OPTIONS.find((s) => s.value === currentSort)?.label || 'Sort by'}
          triggerClassName={pillClass(currentSort !== 'relevance')}
          items={SORT_OPTIONS.map((s) => ({
            label: s.label,
            key: s.value,
            onClick: () => handleSortChange(s.value),
          }))}
        />
      </div>

      {/* Verified Only Toggle */}
      <Button
        variant={localFilters.verifiedOnly ? 'primary' : 'secondary'}
        size="sm"
        onClick={handleVerifiedToggle}
        className="min-h-0 rounded-full border px-3 py-1.5 text-sm font-medium"
      >
        {localFilters.verifiedOnly ? '✓' : 'All'}
      </Button>

      {/* Clear Filters */}
      {(hasActiveFilters || search) && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="px-2">
          Clear
        </Button>
      )}
    </div>
  );
}
