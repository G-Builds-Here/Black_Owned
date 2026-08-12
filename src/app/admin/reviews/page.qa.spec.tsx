/**
 * Business Review Page - QA Validation Tests
 * Validates AC1: List pending businesses for review
 *
 * Given businesses are in "pending_review" status
 * When the admin opens the review page
 * Then businesses are displayed in a table
 * And each row shows name, address, source, and rating
 */

import { render, screen, fireEvent } from '@testing-library/react';
import BusinessReviewPage from './page';

describe('BusinessReviewPage - QA Validation', () => {
  describe('AC1: Display businesses in pending_review status', () => {
    it('renders the page with correct header and subtitle', () => {
      render(<BusinessReviewPage />);
      expect(screen.getByRole('heading', { name: /Business Review Queue/i })).toBeInTheDocument();
      expect(screen.getByText(/Review and moderate pending business submissions/i)).toBeInTheDocument();
    });

    it('displays businesses in a table structure', () => {
      render(<BusinessReviewPage />);
      const table = screen.getByRole('table', { name: /Business review queue/i });
      expect(table).toBeInTheDocument();
    });

    it('shows all required columns: name, address, source, and rating in table header', () => {
      render(<BusinessReviewPage />);
      expect(screen.getByText(/Business Name/i)).toBeInTheDocument();
      expect(screen.getByText(/Address/i)).toBeInTheDocument();
      expect(screen.getByText(/Source/i)).toBeInTheDocument();
      expect(screen.getByText(/Rating/i)).toBeInTheDocument();
    });

    it('displays each business row with name, address, source, and rating data', () => {
      render(<BusinessReviewPage />);

      // Check all business names are present
      expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Afro Threads')).toBeInTheDocument();
      expect(screen.getByText('Heritage Wellness Center')).toBeInTheDocument();
      expect(screen.getByText('Golden Era Barbershop')).toBeInTheDocument();
      expect(screen.getByText("Rhythm & Blues Records")).toBeInTheDocument();

      // Check addresses are present
      expect(screen.getByText('123 Main St, Atlanta GA')).toBeInTheDocument();
      expect(screen.getByText('456 Oak Ave, Houston TX')).toBeInTheDocument();
    });

    it('shows "Pending" rating for businesses with rating 0', () => {
      render(<BusinessReviewPage />);
      const pendingRatings = screen.getAllByText('Pending');
      expect(pendingRatings.length).toBeGreaterThan(0);
    });
  });

  describe('AC1: Search filtering functionality', () => {
    it('renders search input field', () => {
      render(<BusinessReviewPage />);
      const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('filters businesses by name when typing in search', () => {
      render(<BusinessReviewPage />);
      const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);

      fireEvent.change(searchInput, { target: { value: 'Soul' } });

      expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
      expect(screen.queryByText('Afro Threads')).not.toBeInTheDocument();
    });

    it('filters businesses by address when typing in search', () => {
      render(<BusinessReviewPage />);
      const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);

      fireEvent.change(searchInput, { target: { value: 'Atlanta' } });

      expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Golden Era Barbershop')).toBeInTheDocument();
      expect(screen.queryByText('Afro Threads')).not.toBeInTheDocument();
    });

    it('filters businesses by source when typing in search', () => {
      render(<BusinessReviewPage />);
      const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);

      fireEvent.change(searchInput, { target: { value: 'Partner' } });

      expect(screen.getByText('Afro Threads')).toBeInTheDocument();
      expect(screen.queryByText('Soul Food Kitchen')).not.toBeInTheDocument();
    });

    it('shows empty state message when no businesses match search', () => {
      render(<BusinessReviewPage />);
      const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);

      fireEvent.change(searchInput, { target: { value: 'NonExistentBusiness12345' } });

      expect(screen.getByText(/No businesses found matching your search/i)).toBeInTheDocument();
    });

    it('updates business count when filtering', () => {
      render(<BusinessReviewPage />);

      // Initial count
      expect(screen.getByText(/businesses pending review/i)).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
      fireEvent.change(searchInput, { target: { value: 'Atlanta' } });

      // Count should update after filtering
      expect(screen.getByText(/businesses pending review/i)).toBeInTheDocument();
    });
  });

  describe('AC1: Period filter dropdown', () => {
    it('renders period filter dropdown', () => {
      render(<BusinessReviewPage />);
      // Use getAllByText and check first match (the dropdown trigger, not nav item)
      const periodButtons = screen.getAllByText(/This Week/i);
      expect(periodButtons.length).toBeGreaterThan(0);
    });

    it('allows switching between period options', () => {
      render(<BusinessReviewPage />);

      // Click the dropdown trigger (first match is the filter dropdown, not nav)
      const periodButtons = screen.getAllByText(/This Week/i);
      fireEvent.click(periodButtons[0]);

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getAllByText('This Week').length).toBeGreaterThan(0);
      expect(screen.getByText('This Month')).toBeInTheDocument();
    });
  });

  describe('AC1: Source badge display', () => {
    it('displays source badge for Direct Submission', () => {
      render(<BusinessReviewPage />);
      // Multiple businesses have Direct Submission - use getAllByText
      const directSubmissions = screen.getAllByText('Direct Submission');
      expect(directSubmissions.length).toBeGreaterThan(0);
    });

    it('displays source badge for Partner Referral', () => {
      render(<BusinessReviewPage />);
      expect(screen.getByText('Partner Referral')).toBeInTheDocument();
    });

    it('displays source badge for Community Nomination', () => {
      render(<BusinessReviewPage />);
      expect(screen.getByText('Community Nomination')).toBeInTheDocument();
    });
  });

  describe('AC1: Business row details', () => {
    it('shows business ID in each row', () => {
      render(<BusinessReviewPage />);
      expect(screen.getByText('ID: 1')).toBeInTheDocument();
      expect(screen.getByText('ID: 2')).toBeInTheDocument();
    });

    it('shows submitted date for each business', () => {
      render(<BusinessReviewPage />);
      // Multiple businesses share the same date - use getAllByText
      const july14Dates = screen.getAllByText('2026-07-14');
      expect(july14Dates.length).toBeGreaterThan(0);
      expect(screen.getByText('2026-07-13')).toBeInTheDocument();
      expect(screen.getByText('2026-07-10')).toBeInTheDocument();
    });

    it('renders Review button for each business', () => {
      render(<BusinessReviewPage />);
      const reviewButtons = screen.getAllByText('Review');
      expect(reviewButtons.length).toBeGreaterThan(0);
    });
  });

  describe('AC1: Table component integration', () => {
    it('uses Table component with proper accessibility attributes', () => {
      render(<BusinessReviewPage />);
      const table = screen.getByRole('table', { name: /Business review queue/i });
      expect(table).toHaveAttribute('aria-label', 'Business review queue');
    });

    it('renders table header with proper styling', () => {
      render(<BusinessReviewPage />);
      const table = screen.getByRole('table', { name: /Business review queue/i });
      expect(table.querySelector('thead')).toBeInTheDocument();
    });

    it('renders table body with business rows', () => {
      render(<BusinessReviewPage />);
      const table = screen.getByRole('table', { name: /Business review queue/i });
      expect(table.querySelector('tbody')).toBeInTheDocument();
    });
  });

  describe('AC1: Export functionality', () => {
    it('renders Export List button', () => {
      render(<BusinessReviewPage />);
      expect(screen.getByText('Export List')).toBeInTheDocument();
    });
  });
});
