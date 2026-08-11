/**
 * Admin Review Page Tests - Bulk Approval Feature
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminReviewPage from './page';

// Mock the Navigation component
jest.mock('@/components/ui/Navigation', () => ({
  Navigation: ({ onNavigate }: { onNavigate: (section: string) => void }) => (
    <nav data-testid="navigation" onClick={() => onNavigate('test')} />
  ),
}));

// Mock the UI components
jest.mock('@/components/ui', () => ({
  Card: ({ children, variant, padding }: any) => (
    <div data-testid="card" data-variant={variant} data-padding={padding}>
      {children}
    </div>
  ),
  Badge: ({ children, variant, size }: any) => (
    <span data-testid="badge" data-variant={variant} data-size={size}>
      {children}
    </span>
  ),
  Button: ({ children, onClick, disabled, variant, size }: any) => (
    <button
      data-testid="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  Tabs: ({ tabs, selectedKey, onSelectionChange }: any) => (
    <div data-testid="tabs" data-selected={selectedKey}>
      {tabs.map((tab: any) => (
        <button
          key={tab.key}
          data-testid={`tab-${tab.key}`}
          onClick={() => onSelectionChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
  TabPanel: ({ value, children }: any) => <div data-testid="tabpanel">{children}</div>,
}));

// Mock fetch
global.fetch = jest.fn();

describe('AdminReviewPage - Bulk Approval', () => {
  const mockPendingBusinesses = [
    {
      id: 'business-1',
      name: 'Test Business 1',
      category_id: 'cat-1',
      verification_status: 'unverified',
      created_at: { timestamp: 1704067200 },
      phone: null,
      potential_duplicate_id: null,
    },
    {
      id: 'business-2',
      name: 'Test Business 2',
      category_id: 'cat-2',
      verification_status: 'unverified',
      created_at: { timestamp: 1704153600 },
      phone: null,
      potential_duplicate_id: null,
    },
    {
      id: 'business-3',
      name: 'Test Business 3',
      category_id: 'cat-1',
      verification_status: 'unverified',
      created_at: { timestamp: 1704240000 },
      phone: null,
      potential_duplicate_id: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the page with pending businesses count', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { pendingBusinesses: mockPendingBusinesses },
      }),
    });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const badges = screen.getAllByTestId('badge');
      const pendingBadge = badges.find(b => b.getAttribute('data-size') === 'lg');
      expect(pendingBadge).toBeInTheDocument();
      expect(pendingBadge?.textContent).toContain('Pending');
    });
  });

  it('should show select all checkbox when businesses are loaded', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { pendingBusinesses: mockPendingBusinesses },
      }),
    });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      expect(selectAllCheckbox).toBeInTheDocument();
    });
  });

  it('should select all businesses when "Select All" checkbox is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { pendingBusinesses: mockPendingBusinesses },
      }),
    });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      fireEvent.click(selectAllCheckbox);
    });

    // Verify "Approve Selected" button appears with count
    await waitFor(() => {
      const approveButton = screen.getByText(/approve selected \(3\)/i);
      expect(approveButton).toBeInTheDocument();
    });
  });

  it('should toggle individual business selection', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { pendingBusinesses: mockPendingBusinesses },
      }),
    });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      // First checkbox is "Select All", second is first business
      const firstBusinessCheckbox = checkboxes[1];
      fireEvent.click(firstBusinessCheckbox);
    });

    // Verify selection count updates
    await waitFor(() => {
      const approveButton = screen.getByText(/approve selected \(1\)/i);
      expect(approveButton).toBeInTheDocument();
    });
  });

  it('should show "Approve Selected" button when items are selected', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { pendingBusinesses: mockPendingBusinesses },
      }),
    });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      fireEvent.click(selectAllCheckbox);
    });

    await waitFor(() => {
      const approveButton = screen.getByText(/approve selected/i);
      expect(approveButton).toBeInTheDocument();
    });
  });

  it('should show "Clear Selection" button when items are selected', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { pendingBusinesses: mockPendingBusinesses },
      }),
    });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      fireEvent.click(selectAllCheckbox);
    });

    await waitFor(() => {
      const clearButton = screen.getByText(/clear selection/i);
      expect(clearButton).toBeInTheDocument();
    });
  });

  it('should call bulk approve mutation when "Approve Selected" is clicked', async () => {
    const mockMutationResponse = {
      ok: true,
      json: async () => ({
        data: {
          approveBusinesses: {
            success: true,
            approvedCount: 3,
            failedIds: [],
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
      .mockResolvedValueOnce(mockMutationResponse);

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      fireEvent.click(selectAllCheckbox);
    });

    await waitFor(() => {
      const approveButton = screen.getByText(/approve selected/i);
      fireEvent.click(approveButton);
    });

    // Verify mutation was called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    // Check the second call was the mutation
    const mutationCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(mutationCall[1].method).toBe('POST');
    const body = JSON.parse(mutationCall[1].body);
    expect(body.query).toContain('approveBusinesses');
    expect(body.variables.businessIds).toHaveLength(3);
  });

  it('should show loading state during bulk approval', async () => {
    const pendingPromise = new Promise((resolve) => setTimeout(resolve, 100));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      })
      .mockImplementationOnce(() => pendingPromise.then(() => ({
        ok: true,
        json: async () => ({
          data: {
            approveBusinesses: {
              success: true,
              approvedCount: 3,
              failedIds: [],
            },
          },
        }),
      })));

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      fireEvent.click(selectAllCheckbox);
    });

    const approveButton = await screen.findByText(/approve selected/i);
    fireEvent.click(approveButton);

    // Button should show approving state
    await waitFor(() => {
      expect(screen.getByText(/approving/i)).toBeInTheDocument();
    });
  });

  it('should clear selection when "Clear Selection" is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { pendingBusinesses: mockPendingBusinesses },
      }),
    });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      fireEvent.click(selectAllCheckbox);
    });

    await waitFor(() => {
      const clearButton = screen.getByText(/clear selection/i);
      fireEvent.click(clearButton);
    });

    // Verify "Approve Selected" button is no longer visible
    await waitFor(() => {
      expect(screen.queryByText(/approve selected/i)).not.toBeInTheDocument();
    });
  });

  it('should show error when bulk approval fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Approval failed' }],
        }),
      });

    render(<AdminReviewPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      fireEvent.click(selectAllCheckbox);
    });

    await waitFor(() => {
      const approveButton = screen.getByText(/approve selected/i);
      fireEvent.click(approveButton);
    });

    // Error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/approval failed/i)).toBeInTheDocument();
    });
  });

  it('should show empty state when no pending businesses', async () => {
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
});
