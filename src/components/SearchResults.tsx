'use client';

import React from 'react';
import BusinessCard from './ui/BusinessCard';

export interface Business {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  location: string;
  isVerified: boolean;
  imageUrl: string;
  description: string;
  tags: string[];
}

export interface SearchResultsProps {
  businesses: Business[];
  currentPage: number;
  totalPages: number;
  totalResults: number;
  onPageChange: (page: number) => void;
}

const PAGE_SIZE = 10;

export function SearchResults({
  businesses,
  currentPage,
  totalPages,
  totalResults,
  onPageChange,
}: SearchResultsProps) {
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const startIndex = (currentPage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(currentPage * PAGE_SIZE, totalResults);

  return (
    <div className="mt-8">
      {/* Results Count */}
      <div className="mb-6 text-neutral-600">
        Showing {startIndex}-{endIndex} of {totalResults} {totalResults === 1 ? 'business' : 'businesses'}
      </div>

      {/* Business Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {businesses.map((business) => (
          <div key={business.id} data-business-name={business.name}>
            <BusinessCard
              business={business}
              onViewDetails={(id) => console.log('View details:', id)}
              onSave={(id) => console.log('Save:', id)}
              onShare={(id) => console.log('Share:', id)}
              enableLink={true}
            />
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {/* Previous Button */}
          <button
            onClick={handlePrevious}
            disabled={currentPage === 1}
            className={`px-4 py-2 rounded-lg border-2 transition-colors ${
              currentPage === 1
                ? 'border-neutral-200 text-neutral-400 cursor-not-allowed'
                : 'border-neutral-300 text-neutral-700 hover:border-heritage-ochre hover:text-heritage-ochre'
            }`}
            aria-label="Previous page"
          >
            Previous
          </button>

          {/* Page Numbers */}
          {getPageNumbers().map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === 'number' && handlePageClick(page)}
              disabled={typeof page !== 'number'}
              className={`px-4 py-2 rounded-lg border-2 transition-colors min-w-[3rem] ${
                page === currentPage
                  ? 'bg-heritage-ochre text-white border-heritage-ochre'
                  : typeof page === 'number'
                  ? 'border-neutral-300 text-neutral-700 hover:border-heritage-ochre hover:text-heritage-ochre'
                  : 'border-transparent text-neutral-400 cursor-default'
              }`}
              aria-label={typeof page === 'number' ? `Page ${page}` : 'More pages'}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          ))}

          {/* Next Button */}
          <button
            onClick={handleNext}
            disabled={currentPage === totalPages}
            className={`px-4 py-2 rounded-lg border-2 transition-colors ${
              currentPage === totalPages
                ? 'border-neutral-200 text-neutral-400 cursor-not-allowed'
                : 'border-neutral-300 text-neutral-700 hover:border-heritage-ochre hover:text-heritage-ochre'
            }`}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default SearchResults;
