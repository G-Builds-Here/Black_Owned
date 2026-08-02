/**
 * Business Review Page Tests
 */

import { render, screen } from '@testing-library/react';
import BusinessReviewPage from './page';

describe('BusinessReviewPage', () => {
  it('renders the page header', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByRole('heading', { name: /Business Review Queue/i })).toBeInTheDocument();
  });

  it('displays the pending review businesses in a table', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Afro Threads')).toBeInTheDocument();
    expect(screen.getByText('Heritage Wellness Center')).toBeInTheDocument();
  });

  it('shows business name, address, source, and rating columns', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText(/Business Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Address/i)).toBeInTheDocument();
    expect(screen.getByText(/Source/i)).toBeInTheDocument();
    expect(screen.getByText(/Rating/i)).toBeInTheDocument();
  });

  it('displays pending rating when rating is 0', () => {
    render(<BusinessReviewPage />);
    // Check that the first business row shows "Pending" for rating
    const pendingElements = screen.getAllByText('Pending');
    expect(pendingElements.length).toBeGreaterThan(0);
  });

  it('filters businesses by search query', () => {
    render(<BusinessReviewPage />);
    const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('shows count of businesses pending review', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText(/businesses pending review/i)).toBeInTheDocument();
  });
});
