import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';
import styles from './Pagination.module.css';

describe('Pagination', () => {
  it('renders current and total page numbers', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('has aria label for pagination', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);

    expect(screen.getByLabelText('Pagination')).toBeInTheDocument();
  });

  it('calls onPageChange when next button clicked', () => {
    const handlePageChange = vi.fn();
    render(<Pagination currentPage={1} totalPages={5} onPageChange={handlePageChange} />);

    fireEvent.click(screen.getByText('Next'));

    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when previous button clicked', () => {
    const handlePageChange = vi.fn();
    render(<Pagination currentPage={3} totalPages={5} onPageChange={handlePageChange} />);

    fireEvent.click(screen.getByText('Previous'));

    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('disables next button on last page', () => {
    render(<Pagination currentPage={5} totalPages={5} onPageChange={() => {}} />);

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();
  });

  it('disables previous button on first page', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);

    const prevButton = screen.getByText('Previous');
    expect(prevButton).toBeDisabled();
  });

  it('marks current page as active', () => {
    const { container } = render(<Pagination currentPage={3} totalPages={5} onPageChange={() => {}} />);

    const activeButton = container.querySelector(`.${styles.paginationPages} button.${styles.active}`);
    expect(activeButton?.textContent).toBe('3');
  });

  it('shows ellipsis for large page ranges', () => {
    const { container } = render(<Pagination currentPage={5} totalPages={10} onPageChange={() => {}} siblingCount={1} />);

    expect(container.textContent).toContain('...');
  });

  it('handles page button click', () => {
    const handlePageChange = vi.fn();
    render(<Pagination currentPage={1} totalPages={5} onPageChange={handlePageChange} />);

    fireEvent.click(screen.getByText('2'));

    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('applies cultural gold styling for active page', () => {
    const { container } = render(<Pagination currentPage={2} totalPages={5} onPageChange={() => {}} />);
    const activeButton = container.querySelector(`.${styles.active}`);

    expect(activeButton).toBeInTheDocument();
  });
});
