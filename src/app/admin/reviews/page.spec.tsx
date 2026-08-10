/**
 * Business Review Page Tests
 */

import { render, screen, fireEvent } from '@testing-library/react';
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

  it('filters businesses when search query is entered', () => {
    render(<BusinessReviewPage />);
    const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
    fireEvent.change(searchInput, { target: { value: 'Soul Food' } });
    expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
    expect(screen.queryByText('Afro Threads')).not.toBeInTheDocument();
  });

  it('shows empty state when no businesses match search', () => {
    render(<BusinessReviewPage />);
    const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistentbusiness12345' } });
    expect(screen.getByText(/No businesses found/i)).toBeInTheDocument();
  });

  it('displays source badges for each business', () => {
    render(<BusinessReviewPage />);
    const directSubmissionBadges = screen.getAllByText('Direct Submission');
    expect(directSubmissionBadges.length).toBeGreaterThan(0);
    expect(screen.getByText('Partner Referral')).toBeInTheDocument();
    expect(screen.getByText('Community Nomination')).toBeInTheDocument();
  });

  it('displays business ID in each row', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('ID: 1')).toBeInTheDocument();
    expect(screen.getByText('ID: 2')).toBeInTheDocument();
  });

  it('shows review button for each business', () => {
    render(<BusinessReviewPage />);
    const reviewButtons = screen.getAllByText('Review');
    expect(reviewButtons.length).toBeGreaterThan(0);
  });

  it('displays submitted date for each business', () => {
    render(<BusinessReviewPage />);
    const july14Dates = screen.getAllByText('2026-07-14');
    expect(july14Dates.length).toBeGreaterThan(0);
    expect(screen.getByText('2026-07-13')).toBeInTheDocument();
    expect(screen.getByText('2026-07-11')).toBeInTheDocument();
  });

  it('displays period filter dropdown', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText(/This Week/i)).toBeInTheDocument();
  });

  it('displays export button', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('Export List')).toBeInTheDocument();
  });

  it('shows address column data for each business', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('123 Main St, Atlanta GA')).toBeInTheDocument();
    expect(screen.getByText('456 Oak Ave, Houston TX')).toBeInTheDocument();
  });
});
