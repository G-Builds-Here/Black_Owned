/**
 * Admin Review Page QA Tests - LOC-0068-AC5
 *
 * Validates AC5: Bulk approve multiple businesses
 * - Given multiple businesses are pending
 * - When the admin selects multiple businesses with checkboxes
 * - And clicks the "Approve Selected" button
 * - Then all selected businesses are approved
 * - And the UI shows success confirmation with count
 */

'use client';

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminReviewPage from './page';

// Mock the fetch API
global.fetch = jest.fn();

const mockPendingBusinesses = [
  {
    id: 'biz-001',
    name: 'Soul Food Kitchen',
    address: '123 Main St, Harlem, NY',
    source: 'Google Maps',
    rating: 4.5,
    category: 'Food & Dining',
    phone: '(555) 123-4567',
    website: 'https://soulfoodkitchen.com',
    status: 'pending_review',
    created_at: { timestamp: 1723260000 },
  },
  {
    id: 'biz-002',
    name: 'Black Diamond Consulting',
    address: '456 Business Ave, Atlanta, GA',
    source: 'Bing Maps',
    rating: 5.0,
    category: 'Professional Services',
    phone: '(555) 987-6543',
    website: 'https://blackdiamondconsulting.com',
    status: 'pending_review',
    created_at: { timestamp: 1723346400 },
  },
  {
    id: 'biz-003',
    name: 'Heritage Wellness Center',
    address: '789 Health Blvd, Chicago, IL',
    source: 'Google Maps',
    rating: 4.8,
    category: 'Health & Wellness',
    phone: '(555) 456-7890',
    website: 'https://heritagewellness.com',
    status: 'pending_review',
    created_at: { timestamp: 1723432800 },
  },
];

describe('Admin Review Page - LOC-0068-AC5: Bulk Approve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Checkbox Selection', () => {
    it('renders checkboxes for each business', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
    });

    it('allows selecting individual businesses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Check that selection badge appears
      await waitFor(() => {
        expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
      });
    });

    it('allows selecting multiple businesses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Check that selection count updates
      await waitFor(() => {
        expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
      });
    });

    it('toggles checkbox selection', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');

      // Select
      fireEvent.click(checkboxes[0]);
      await waitFor(() => {
        expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
      });

      // Deselect
      fireEvent.click(checkboxes[0]);
      await waitFor(() => {
        expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Select All / Deselect All', () => {
    it('shows select all button when businesses exist', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/select all/i)).toBeInTheDocument();
    });

    it('selects all businesses when clicking select all', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/select all/i));

      await waitFor(() => {
        expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
      });
    });

    it('changes to deselect all when all are selected', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select all
      fireEvent.click(screen.getByText(/select all/i));
      await waitFor(() => {
        expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
      });

      // Button should now say "Deselect All"
      expect(screen.getByText(/deselect all/i)).toBeInTheDocument();
    });

    it('deselects all when clicking deselect all', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select all
      fireEvent.click(screen.getByText(/select all/i));
      await waitFor(() => {
        expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
      });

      // Deselect all
      fireEvent.click(screen.getByText(/deselect all/i));
      await waitFor(() => {
        expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Bulk Approve Flow', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('shows approve selected button when businesses are selected', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              bulkUpdateVerificationStatus: {
                success: true,
                updatedCount: 2,
              },
            },
          }),
        });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select 2 businesses
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Approve button should appear
      await waitFor(() => {
        expect(screen.getByText(/approve selected \(2\)/i)).toBeInTheDocument();
      });
    });

    it('calls bulkUpdateVerificationStatus mutation when approving selected', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              bulkUpdateVerificationStatus: {
                success: true,
                updatedCount: 2,
              },
            },
          }),
        });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select 2 businesses
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click approve selected
      await waitFor(() => {
        expect(screen.getByText(/approve selected \(2\)/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/approve selected/i));

      // Verify the mutation was called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/graphql',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('bulkUpdateVerificationStatus'),
          })
        );
      });
    });

    it('shows success message with count after bulk approve', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              bulkUpdateVerificationStatus: {
                success: true,
                updatedCount: 2,
              },
            },
          }),
        });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select 2 businesses
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click approve selected
      await waitFor(() => {
        expect(screen.getByText(/approve selected/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/approve selected/i));

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText(/successfully approved 2 businesses/i)).toBeInTheDocument();
      });
    });

    it('removes approved businesses from the list after bulk approve', async () => {
      const remainingBusinesses = [mockPendingBusinesses[2]];
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              bulkUpdateVerificationStatus: {
                success: true,
                updatedCount: 2,
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: remainingBusinesses },
          }),
        });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
        expect(screen.getByText(/black diamond consulting/i)).toBeInTheDocument();
        expect(screen.getByText(/heritage wellness center/i)).toBeInTheDocument();
      });

      // Select first 2 businesses
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click approve selected
      await waitFor(() => {
        expect(screen.getByText(/approve selected/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/approve selected/i));

      // Verify only 1 business remains
      await waitFor(() => {
        expect(screen.queryByText(/soul food kitchen/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/black diamond consulting/i)).not.toBeInTheDocument();
        expect(screen.getByText(/heritage wellness center/i)).toBeInTheDocument();
      });
    });

    it('clears selection after bulk approve', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              bulkUpdateVerificationStatus: {
                success: true,
                updatedCount: 2,
              },
            },
          }),
        });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select businesses
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      await waitFor(() => {
        expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
      });

      // Click approve selected
      fireEvent.click(screen.getByText(/approve selected/i));

      // Verify selection is cleared
      await waitFor(() => {
        expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
      });
    });

    it('shows error when bulk approve fails', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              bulkUpdateVerificationStatus: {
                success: false,
                updatedCount: 0,
                error: 'Database error',
              },
            },
          }),
        });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select one business
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Click approve
      await waitFor(() => {
        expect(screen.getByText(/approve selected/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/approve selected/i));

      // Verify error is shown
      await waitFor(() => {
        expect(screen.getByText(/database error/i)).toBeInTheDocument();
      });
    });

    it('handles network error during bulk approve', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockRejectedValueOnce(new Error('Network error'));
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select a business
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Click approve
      await waitFor(() => {
        expect(screen.getByText(/approve selected/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/approve selected/i));

      // Verify error is shown
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Clear Selection', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('shows clear selection button when businesses are selected', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select a business
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      await waitFor(() => {
        expect(screen.getByText(/clear selection/i)).toBeInTheDocument();
      });
    });

    it('clears selection when clicking clear selection button', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });
      (global.fetch as jest.Mock) = mockFetch;

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Select businesses
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      await waitFor(() => {
        expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
      });

      // Click clear selection
      fireEvent.click(screen.getByText(/clear selection/i));

      await waitFor(() => {
        expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('does not show bulk approve controls when no businesses are selected', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Verify no selection badge
      expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
      // Verify no approve selected button
      expect(screen.queryByText(/approve selected/i)).not.toBeInTheDocument();
      // Verify no clear selection button
      expect(screen.queryByText(/clear selection/i)).not.toBeInTheDocument();
    });

    it('updates selection count as businesses are selected/deselected', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');

      // Select first
      fireEvent.click(checkboxes[0]);
      await waitFor(() => {
        expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
      });

      // Select second
      fireEvent.click(checkboxes[1]);
      await waitFor(() => {
        expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
      });

      // Select third
      fireEvent.click(checkboxes[2]);
      await waitFor(() => {
        expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
      });

      // Deselect one
      fireEvent.click(checkboxes[1]);
      await waitFor(() => {
        expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
      });
    });
  });
});
