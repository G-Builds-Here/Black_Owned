/**
 * /owner dashboard page tests
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OwnerDashboardPage from './page';

const mockRouter = { replace: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

global.fetch = jest.fn();

const SESSION = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user: { id: 'u-1', email: 'owner@example.com', name: 'Owner' },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const BIZ = {
  id: '11111111-2222-3333-4444-555555555555',
  name: 'Soul Kitchen',
  description: 'Southern soul food',
  category: 'Food & Dining',
  status: 'verified',
  createdAt: '2026-08-01T00:00:00.000Z',
};

describe('OwnerDashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    (global.fetch as jest.Mock).mockReset();
  });

  it('redirects to /login when there is no session', async () => {
    render(<OwnerDashboardPage />);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/login')
    );
  });

  it('lists the user businesses with category, status and view chart', async () => {
    window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { businesses: [BIZ] } })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: {
            days: [
              { date: '2026-08-20', views: 2 },
              { date: '2026-08-21', views: 1 },
            ],
          },
        })
      );

    render(<OwnerDashboardPage />);

    expect(await screen.findByText('Soul Kitchen')).toBeInTheDocument();
    expect(screen.getByText(/Food & Dining/)).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Southern soul food')).toBeInTheDocument();
    // Chart totals: 2 + 1 = 3 views over 2 days.
    expect(screen.getByRole('img', { name: '3 views in the last 2 days' })).toBeInTheDocument();
  });

  it('shows the empty state with a claim link when the user owns nothing', async () => {
    window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { businesses: [] } })
    );

    render(<OwnerDashboardPage />);

    expect(await screen.findByText('No businesses yet')).toBeInTheDocument();
    expect(screen.getByText('Claim a Business')).toBeInTheDocument();
  });

  it('clears the session and redirects when the API rejects the token', async () => {
    window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { success: false, error: 'unauthenticated' })
    );

    render(<OwnerDashboardPage />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/login'));
    expect(window.localStorage.getItem('black-owned.session')).toBeNull();
  });

  it('saves an edited description via PATCH and updates the card', async () => {
    window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { businesses: [BIZ] } })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { days: [] },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: {
            id: BIZ.id,
            name: BIZ.name,
            description: 'New description',
          },
        })
      );

    render(<OwnerDashboardPage />);
    await screen.findByText('Soul Kitchen');

    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const textarea = screen.getByLabelText('Description');
    fireEvent.change(textarea, { target: { value: 'New description' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByText('New description')).toBeInTheDocument()
    );
    const patchCall = (global.fetch as jest.Mock).mock.calls.find(
      (call) => String(call[0]).includes('/api/owner/businesses/') && call[1]?.method === 'PATCH'
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall![1] as { body: string }).body)).toEqual({
      name: BIZ.name,
      description: 'New description',
    });
  });
});
