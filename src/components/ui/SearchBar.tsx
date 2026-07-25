'use client';

import React, { useState } from 'react';
import Button from './Button';

export interface SearchBarProps {
  onSearch?: (query: string, filters: string[]) => void;
  categories?: string[];
  placeholder?: string;
}

const DEFAULT_CATEGORIES = [
  'All',
  'Food & Dining',
  'Professional Services',
  'Retail & Fashion',
  'Health & Wellness',
  'Beauty & Personal Care',
  'Arts & Entertainment',
  'Sports & Recreation',
  'Education',
  'Technology',
];

export function SearchBar({
  onSearch = () => {},
  categories = DEFAULT_CATEGORIES,
  placeholder = 'Search for businesses...',
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  const handleFilterToggle = (category: string) => {
    setSelectedFilters((prev) =>
      prev.includes(category)
        ? prev.filter((f) => f !== category)
        : [...prev, category]
    );
  };

  const handleSearch = () => {
    const filters = selectedFilters.filter((f) => f !== 'All');
    onSearch(query, filters);
  };

  const handleClear = () => {
    setQuery('');
    setSelectedFilters([]);
    onSearch('', []);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Search Input */}
      <div className="relative mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={placeholder}
          className="w-full px-6 py-4 pr-32 text-lg bg-white rounded-xl shadow-lg border-2 border-transparent focus:border-heritage-ochre focus:outline-none transition-colors"
          aria-label="Search businesses"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={handleClear}
            className="text-neutral-500 hover:text-neutral-700"
            aria-label="Clear search"
          >
            Clear
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSearch}
            aria-label="Submit search"
          >
            Search
          </Button>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category filters">
        {categories.map((category) => {
          const isSelected = selectedFilters.includes(category);
          return (
            <button
              key={category}
              onClick={() => handleFilterToggle(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-heritage-ochre text-white shadow-md'
                  : 'bg-white text-neutral-700 border-2 border-neutral-200 hover:border-heritage-ochre hover:text-heritage-ochre'
              }`}
              aria-pressed={isSelected}
            >
              {category}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SearchBar;
