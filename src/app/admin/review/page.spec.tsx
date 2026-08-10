/**
 * Admin Review Page Tests - LOC-0068-AC3
 *
 * Validates AC3: Approve a business for import
 * - Given a business is selected
 * - When the admin clicks "Approve"
 * - Then the business status changes to "approved"
 * - And the UI shows a success confirmation
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
    createdAt: { timestamp: 1723260000 },
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
    createdAt: { timestamp: 1723346400 },
  },
];

describe('Admin Review Page - LOC-0068-AC3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Page Rendering', () => {
    it('renders the admin review page with pending businesses tab', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: [] },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/business review queue/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/pending \(0\)/i)).toBeInTheDocument();
    });

    it('displays pending businesses in cards', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
        expect(screen.getByText(/black diamond consulting/i)).toBeInTheDocument();
      });
    });

    it('shows approve and reject buttons for each business', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        const approveButtons = screen.getAllByTestId('button');
        const approveButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('approve'));
        const rejectButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('reject'));
        expect(approveButton).toBeInTheDocument();
        expect(rejectButton).toBeInTheDocument();
      });
    });
  });

  describe('AC3: Approve Business Flow', () => {
    it('calls approveBusiness mutation when approve button is clicked', async () => {
      const mockSuccessResponse = {
        ok: true,
        json: async () => ({
          data: {
            approveBusiness: {
              success: true,
              business: mockPendingBusinesses[0],
            },
          },
        }),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce(mockSuccessResponse);

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByTestId('button');
      const approveButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('approve'));
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/graphql',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('approveBusiness'),
          })
        );
      });
    });

    it('shows success confirmation message after approving a business', async () => {
      const mockSuccessResponse = {
        ok: true,
        json: async () => ({
          data: {
            approveBusiness: {
              success: true,
              business: mockPendingBusinesses[0],
            },
          },
        }),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce(mockSuccessResponse);

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByTestId('button');
      const approveButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('approve'));
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.getByText(/business approved successfully/i)).toBeInTheDocument();
      });
    });

    it('removes approved business from pending list after successful approval', async () => {
      const mockSuccessResponse = {
        ok: true,
        json: async () => ({
          data: {
            approveBusiness: {
              success: true,
              business: mockPendingBusinesses[0],
            },
          },
        }),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce(mockSuccessResponse);

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
        expect(screen.getByText(/black diamond consulting/i)).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByTestId('button');
      const approveButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('approve'));
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.queryByText(/soul food kitchen/i)).not.toBeInTheDocument();
      });

      expect(screen.getByText(/black diamond consulting/i)).toBeInTheDocument();
    });

    it('shows error message when approval fails', async () => {
      const mockErrorResponse = {
        ok: true,
        json: async () => ({
          errors: [{ message: 'Business not found' }],
        }),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce(mockErrorResponse);

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByTestId('button');
      const approveButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('approve'));
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });

    it('handles network error gracefully', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByTestId('button');
      const approveButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('approve'));
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    it('clears success message after 3 seconds', async () => {
      jest.useFakeTimers();

      const mockSuccessResponse = {
        ok: true,
        json: async () => ({
          data: {
            approveBusiness: {
              success: true,
              business: mockPendingBusinesses[0],
            },
          },
        }),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { pendingBusinesses: mockPendingBusinesses },
          }),
        })
        .mockResolvedValueOnce(mockSuccessResponse);

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByTestId('button');
      const approveButton = approveButtons.find(btn => btn.textContent?.toLowerCase().includes('approve'));
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.getByText(/business approved successfully/i)).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(screen.queryByText(/business approved successfully/i)).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('State Matrix - Edge Cases', () => {
    it('handles empty pending businesses list', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: [] },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/no pending businesses/i)).toBeInTheDocument();
      });
    });

    it('handles GraphQL error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Database connection failed' }],
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/error loading pending businesses/i)).toBeInTheDocument();
      });
    });

    it('handles HTTP error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/error loading pending businesses/i)).toBeInTheDocument();
      });
    });
  });
});
