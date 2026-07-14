import React from 'react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
}) => {
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

  const getPageNumbers = (): (number | '...')[] => {
    const pages: (number | '...')[] = [];
    const start = Math.max(1, currentPage - siblingCount);
    const end = Math.min(totalPages, currentPage + siblingCount);

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('...');
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        className="pagination-prev"
        onClick={handlePrevious}
        disabled={currentPage === 1}
      >
        Previous
      </button>
      <ul className="pagination-pages">
        {getPageNumbers().map((page, index) => (
          <li key={index}>
            <button
              className={page === currentPage ? 'active' : ''}
              onClick={() => typeof page === 'number' && onPageChange(page)}
              disabled={page === '...'}
            >
              {page}
            </button>
          </li>
        ))}
      </ul>
      <button
        className="pagination-next"
        onClick={handleNext}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </nav>
  );
};

export default Pagination;
