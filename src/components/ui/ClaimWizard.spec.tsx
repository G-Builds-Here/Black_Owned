/**
 * ClaimWizard Component Tests
 *
 * Tests for the 3-step business claim workflow wizard.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimWizard, Business } from './ClaimWizard';
import { ToastProvider } from './Toast';

// Mock the Toast hook
const mockAddToast = jest.fn();
jest.mock('./Toast', () => ({
  ...jest.requireActual('./Toast'),
  useToast: () => ({
    addToast: mockAddToast,
    removeToast: jest.fn(),
    clearToasts: jest.fn(),
  }),
}));

const mockBusiness: Business = {
  id: 'biz-123',
  name: 'Cozy Corner Cafe',
  address: '123 Main Street, Downtown',
  verified: false,
  claimStatus: 'unclaimed',
};

const defaultProps = {
  business: mockBusiness,
  isOpen: true,
  onClose: jest.fn(),
  onSubmit: jest.fn().mockResolvedValue(undefined),
};

function renderWithToast(component: React.ReactElement) {
  return render(<ToastProvider>{component}</ToastProvider>);
}

describe('ClaimWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders step 1 (Confirm Ownership) by default', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    expect(screen.getByText('Confirm Ownership')).toBeInTheDocument();
    expect(screen.getByText('Confirm you are the owner')).toBeInTheDocument();
    expect(screen.getByText('Cozy Corner Cafe')).toBeInTheDocument();
    expect(screen.getByText('123 Main Street, Downtown')).toBeInTheDocument();
  });

  it('shows step indicator with 3 steps', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('navigates to step 2 when Next is clicked', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    expect(screen.getByText('Upload Documents')).toBeInTheDocument();
    expect(screen.getByText('Upload supporting documents')).toBeInTheDocument();
  });

  it('navigates back to step 1 when Back is clicked from step 2', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Upload Documents')).toBeInTheDocument();

    // Go back to step 1
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('Confirm Ownership')).toBeInTheDocument();
  });

  it('shows step 3 (Review & Submit) after clicking Next from step 2', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Add a file
    const fileInput = screen.getByInputType('file');
    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    // Go to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Review & Submit')).toBeInTheDocument();
    expect(screen.getByText('Claim Summary')).toBeInTheDocument();
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
  });

  it('shows submit button on step 3', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    // Navigate to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const fileInput = screen.getByInputType('file');
    const testFile = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument();
  });

  it('calls onSubmit when Submit is clicked on step 3', async () => {
    const mockOnSubmit = jest.fn().mockResolvedValue(undefined);
    renderWithToast(
      <ClaimWizard {...defaultProps} onSubmit={mockOnSubmit} />
    );

    // Navigate to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const fileInput = screen.getByInputType('file');
    const testFile = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('biz-123', ['doc.pdf']);
    });
  });

  it('shows success toast and closes on successful submit', async () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    // Navigate to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const fileInput = screen.getByInputType('file');
    const testFile = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('Claim request submitted'),
        expect.objectContaining({ variant: 'success' })
      );
    });
  });

  it('shows already claimed message when business is claimed', () => {
    const claimedBusiness: Business = {
      ...mockBusiness,
      claimStatus: 'claimed',
    };

    renderWithToast(
      <ClaimWizard
        {...defaultProps}
        business={claimedBusiness}
      />
    );

    expect(screen.getByText(/this business has already been claimed/i)).toBeInTheDocument();
    expect(screen.getByText(/contact support/i)).toBeInTheDocument();
    expect(screen.getByText('support@blackowned.local')).toBeInTheDocument();

    // No submit button should be present
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });

  it('shows rejection banner when reclaiming after rejection', () => {
    const rejectedBusiness: Business = {
      ...mockBusiness,
      claimStatus: 'rejected',
      previousRejectionReason: 'Document illegible',
    };

    renderWithToast(
      <ClaimWizard
        {...defaultProps}
        business={rejectedBusiness}
      />
    );

    expect(screen.getByText(/previous claim rejected: document illegible/i)).toBeInTheDocument();
  });

  it('rejects files larger than 10MB', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    const fileInput = screen.getByInputType('file');
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('File size exceeds 10MB limit'),
      expect.objectContaining({ variant: 'warning' })
    );
  });

  it('rejects non-PDF and non-image files', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    const fileInput = screen.getByInputType('file');
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('Only PDF and image files are allowed'),
      expect.objectContaining({ variant: 'warning' })
    );
  });

  it('allows multiple valid files to be uploaded', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    const fileInput = screen.getByInputType('file');
    const file1 = new File(['test1'], 'doc1.pdf', { type: 'application/pdf' });
    const file2 = new File(['test2'], 'image.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file1, file2] } });

    expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
    expect(screen.getByText('image.jpg')).toBeInTheDocument();
  });

  it('removes file when remove button is clicked', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    const fileInput = screen.getByInputType('file');
    const testFile = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(screen.getByText('doc.pdf')).toBeInTheDocument();

    const removeButton = screen.getByLabelText('Remove doc.pdf');
    fireEvent.click(removeButton);

    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const mockOnClose = jest.fn();
    renderWithToast(<ClaimWizard {...defaultProps} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('disables Next button on step 2 when no files are uploaded', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('enables Next button on step 2 when files are uploaded', () => {
    renderWithToast(<ClaimWizard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const fileInput = screen.getByInputType('file');
    const testFile = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeEnabled();
  });

  it('resets wizard state when modal is closed', () => {
    const mockOnClose = jest.fn();
    renderWithToast(<ClaimWizard {...defaultProps} onClose={mockOnClose} />);

    // Navigate to step 2 and add a file
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const fileInput = screen.getByInputType('file');
    const testFile = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // Reopen and verify reset
    renderWithToast(<ClaimWizard {...defaultProps} onClose={mockOnClose} />);

    expect(screen.getByText('Confirm Ownership')).toBeInTheDocument();
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
  });

  it('does not show step indicator and footer when already claimed', () => {
    const claimedBusiness: Business = {
      ...mockBusiness,
      claimStatus: 'claimed',
    };

    renderWithToast(
      <ClaimWizard
        {...defaultProps}
        business={claimedBusiness}
      />
    );

    // Step indicator should not be visible
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();

    // Footer buttons should not be visible
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });
});
