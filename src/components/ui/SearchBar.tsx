'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from './Button';

export interface SearchBarProps {
  onSearch?: (query: string, filters: string[]) => void;
  categories?: string[];
  placeholder?: string;
  suggestions?: string[];
  maxSuggestions?: number;
  debounceMs?: number;
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

const DEFAULT_SUGGESTIONS = [
  'Coffee',
  'Coffee Shop',
  'Cafe',
  'Restaurant',
  'Bakery',
  'BBQ',
  'Soul Food',
  'Steakhouse',
  'Italian',
  'Mexican',
];

const DEBOUNCE_DELAY_MS = 300;
const MAX_SUGGESTIONS = 5;

export function SearchBar({
  onSearch = () => {},
  categories = DEFAULT_CATEGORIES,
  placeholder = 'Search for businesses...',
  suggestions = DEFAULT_SUGGESTIONS,
  maxSuggestions = MAX_SUGGESTIONS,
  debounceMs = DEBOUNCE_DELAY_MS,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFilterToggle = (category: string) => {
    setSelectedFilters((prev) =>
      prev.includes(category)
        ? prev.filter((f) => f !== category)
        : [...prev, category]
    );
  };

  const handleSearch = useCallback((searchQuery: string) => {
    const filters = selectedFilters.filter((f) => f !== 'All');
    onSearch(searchQuery, filters);
  }, [selectedFilters, onSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setShowSuggestions(true);

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      if (newValue.trim()) {
        const filtered = suggestions
          .filter((s) => s.toLowerCase().includes(newValue.toLowerCase()))
          .slice(0, maxSuggestions);
        setFilteredSuggestions(filtered);
      } else {
        setFilteredSuggestions([]);
      }
    }, debounceMs);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    handleSearch(suggestion);
  };

  const handleClear = () => {
    setQuery('');
    setSelectedFilters([]);
    setShowSuggestions(false);
    setFilteredSuggestions([]);
    onSearch('', []);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false);
      handleSearch(query);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto" ref={containerRef}>
      {/* Search Input */}
      <div className="relative mb-6">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-6 py-4 pr-32 text-lg bg-white rounded-xl shadow-lg border-2 border-transparent focus:border-heritage-ochre focus:outline-none transition-colors"
          aria-label="Search businesses"
          aria-autocomplete="list"
          aria-expanded={showSuggestions && filteredSuggestions.length > 0}
          role="combobox"
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
            onClick={() => handleSearch(query)}
            aria-label="Submit search"
          >
            Search
          </Button>
        </div>

        {/* Autocomplete Suggestions Dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <ul
            className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-xl border border-neutral-200 max-h-60 overflow-y-auto"
            role="listbox"
          >
            {filteredSuggestions.map((suggestion, index) => (
              <li
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-6 py-3 cursor-pointer hover:bg-heritage-ochre/10 transition-colors"
                role="option"
                aria-selected={false}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        )}
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
