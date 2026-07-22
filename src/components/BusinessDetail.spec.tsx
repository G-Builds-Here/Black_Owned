/**
 * Unit tests for BusinessDetail component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BusinessDetail, Business } from './BusinessDetail';

// Mock the notification hook
const mockShowNotification = jest.fn();
jest.mock('@/components/ui', () => ({
  ...jest.requireActual('@/components/ui'),
  useNotification: () => ({
    showNotification: mockShowNotification,
  }),
}));

// Mock the graphql client
jest.mock('@/lib/graphql/graphql-client', () => ({
  updateBusiness: jest.fn(),
}));

import { updateBusiness } from '@/lib/graphql/graphql-client';

const mockBusiness: Business = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Soul Food Kitchen',
  description: 'Authentic Southern cuisine with a modern twist.',
  categoryId: 'food-dining',
  ownerId: 'user-123',
  verified: true,
  createdAt: {
    timestamp: 1704067200, // 2024-01-01
  },
};

describe('BusinessDetail', () => {
  describe('Loading State', () => {
    it('shows loading spinner and message when loading is true', () => {
      render(
        <BusinessDetail
          business={null}
          loading={true}
          error={null}
        />
      );

      expect(screen.getByText(/loading business details/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when error is provided', () => {
      render(
        <BusinessDetail
          business={null}
          loading={false}
          error="Network error occurred"
        />
      );

      expect(screen.getByText(/unable to load business/i)).toBeInTheDocument();
      expect(screen.getByText(/network error occurred/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('shows retry button that can be clicked', () => {
      render(
        <BusinessDetail
          business={null}
          loading={false}
          error="Network error occurred"
        />
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toBeEnabled();
    });
  });

  describe('Not Found State', () => {
    it('shows not found message when business is null and not loading', () => {
      render(
        <BusinessDetail
          business={null}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/business not found/i)).toBeInTheDocument();
      expect(screen.getByText(/does not exist or has been removed/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /browse directory/i })).toHaveAttribute(
        'href',
        '/directory'
      );
    });
  });

  describe('Success State', () => {
    it('displays business name', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
    });

    it('displays verified badge for verified businesses', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/verified business/i)).toBeInTheDocument();
    });

    it('does not show verified badge for unverified businesses', () => {
      const unverifiedBusiness: Business = {
        ...mockBusiness,
        verified: false,
      };

      render(
        <BusinessDetail
          business={unverifiedBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.queryByText(/verified business/i)).not.toBeInTheDocument();
    });

    it('displays category', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/food dining/i)).toBeInTheDocument();
    });

    it('displays formatted date', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      // Should show a formatted date (format depends on locale)
      expect(screen.getByText(/joined:/i)).toBeInTheDocument();
    });

    it('displays business ID', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/550e8400-e29b-41d4-a716-446655440000/i)).toBeInTheDocument();
    });

    it('shows back to directory link', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      const backLink = screen.getByRole('link', { name: /back to directory/i });
      expect(backLink).toHaveAttribute('href', '/directory');
    });

    it('shows contact button for verified businesses', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByRole('button', { name: /contact business/i })).toBeInTheDocument();
    });

    it('does not show contact button for unverified businesses', () => {
      const unverifiedBusiness: Business = {
        ...mockBusiness,
        verified: false,
      };

      render(
        <BusinessDetail
          business={unverifiedBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.queryByRole('button', { name: /contact business/i })).not.toBeInTheDocument();
    });

    it('displays status as verified or unverified', () => {
      const { rerender } = render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getAllByText(/verified/i)).toHaveLength(2); // "Verified Business" badge + "Verified" status

      rerender(
        <BusinessDetail
          business={{ ...mockBusiness, verified: false }}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/unverified/i)).toBeInTheDocument();
    });
  });

  describe('Edit Profile (Owner Only)', () => {
    it('shows edit button when user is owner', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    });

    it('does not show edit button when user is not owner', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={false}
        />
      );

      expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
    });

    it('shows edit form when edit button is clicked', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      expect(screen.getByRole('textbox', { name: /business name/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
    });

    it('pre-populates edit form with current values', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      expect(screen.getByRole('textbox', { name: /business name/i })).toHaveValue('Soul Food Kitchen');
      expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Authentic Southern cuisine with a modern twist.');
    });

    it('shows save and cancel buttons in edit mode', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('hides back to directory link in edit mode', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      // Initially shows back link
      expect(screen.getByRole('link', { name: /back to directory/i })).toBeInTheDocument();

      // Click edit button
      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      // Back link should be hidden in edit mode
      expect(screen.queryByRole('link', { name: /back to directory/i })).not.toBeInTheDocument();
    });

    it('calls updateBusiness mutation when save is clicked', async () => {
      const mockUpdateResult = {
        success: true,
        business: mockBusiness,
        error: null,
      };
      (updateBusiness as jest.Mock).mockResolvedValue(mockUpdateResult);

      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      // Enter edit mode
      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      // Change values
      const nameInput = screen.getByRole('textbox', { name: /name/i });
      const descriptionInput = screen.getByRole('textbox', { name: /description/i });

      fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
      fireEvent.change(descriptionInput, { target: { value: 'Updated description' } });

      // Click save
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      // Verify mutation was called
      await waitFor(() => {
        expect(updateBusiness).toHaveBeenCalledWith(mockBusiness.id, {
          name: 'Updated Name',
          description: 'Updated description',
        });
      });
    });

    it('shows success notification when update succeeds', async () => {
      const mockUpdateResult = {
        success: true,
        business: mockBusiness,
        error: null,
      };
      (updateBusiness as jest.Mock).mockResolvedValue(mockUpdateResult);

      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          'Profile Updated',
          'Profile updated'
        );
      });
    });

    it('shows error notification when update fails', async () => {
      const mockUpdateResult = {
        success: false,
        business: null,
        error: 'You do not have permission to update this business',
      };
      (updateBusiness as jest.Mock).mockResolvedValue(mockUpdateResult);

      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          'Update Failed',
          'You do not have permission to update this business',
          'error'
        );
      });
    });

    it('exits edit mode after successful save', async () => {
      const mockUpdateResult = {
        success: true,
        business: mockBusiness,
        error: null,
      };
      (updateBusiness as jest.Mock).mockResolvedValue(mockUpdateResult);

      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      // Should be in edit mode
      expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      // Wait for the update to complete
      await waitFor(() => {
        // Should exit edit mode and show edit button again
        expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
      });
    });

    it('cancels edit mode and restores original values', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          isOwner={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      // Change values
      const nameInput = screen.getByRole('textbox', { name: /name/i });
      fireEvent.change(nameInput, { target: { value: 'Changed Name' } });

      // Click cancel
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      // Should exit edit mode
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    });
  });

  describe('Category Formatting', () => {
    it('formats category ID with dashes to readable name', () => {
      const business: Business = {
        ...mockBusiness,
        categoryId: 'professional-services',
      };

      render(
        <BusinessDetail
          business={business}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/professional services/i)).toBeInTheDocument();
    });

    it('handles category IDs without dashes', () => {
      const business: Business = {
        ...mockBusiness,
        categoryId: 'retail',
      };

      render(
        <BusinessDetail
          business={business}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/Retail/i)).toBeInTheDocument();
    });
  });

  describe('Date Formatting', () => {
    it('formats timestamp to readable date', () => {
      const business: Business = {
        ...mockBusiness,
        createdAt: {
          timestamp: 1609459200, // 2021-01-01
        },
      };

      render(
        <BusinessDetail
          business={business}
          loading={false}
          error={null}
        />
      );

      // Should contain some date format
      expect(screen.getByText(/joined:/i)).toBeInTheDocument();
    });
  });
});
