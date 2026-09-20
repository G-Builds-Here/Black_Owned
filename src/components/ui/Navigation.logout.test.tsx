/**
 * LOC-0094 AC3 — Sign out ends the session (component integration).
 *
 * Per the AC test contract this suite mocks the logout fetch and drives the
 * real client store: the mock mirrors the merged LOC-0092 route response
 * (200 + { success: true } with the bw-session expiry), and the server-side
 * half -- real logout route expiring the cookie, then the real guard
 * bouncing a signed-out /admin visit -- is asserted without any mocks in
 * src/qa/loc-0094-signout-guard.spec.ts (node env; jose's ESM browser build
 * cannot load under jsdom, so the server seam lives there, not here).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Navigation } from './Navigation';

const mockRouter = { replace: jest.fn(), push: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const SESSION = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user: { id: 'u-9', email: 'bruce@example.com', name: 'Bruce' },
};

const fetchMock = jest.fn();

async function completeSignOut() {
  render(<Navigation />);
  const signOutButton = await screen.findByRole('button', { name: 'Sign out' });
  fireEvent.click(signOutButton);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
}

describe('Navigation sign out (LOC-0094 AC3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
    fetchMock.mockImplementation(async (input: unknown, init?: { method?: string }) => {
      const url = String(input);
      if (url === '/api/auth/logout' && init?.method === 'POST') {
        // Response shape of the merged POST /api/auth/logout (LOC-0092):
        // 200 + { success: true }, Set-Cookie expiring bw-session.
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
          headers: new Headers({
            'set-cookie': 'bw-session=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0',
          }),
        };
      }
      throw new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends a POST /api/auth/logout request', async () => {
    await completeSignOut();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the client-side session store', async () => {
    await completeSignOut();
    expect(window.localStorage.getItem('black-owned.session')).toBeNull();
  });

  it('lands the user on /', async () => {
    await completeSignOut();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('reverts the header to the anonymous state without a manual reload', async () => {
    await completeSignOut();
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByText('Bruce')).toBeNull();
  });
});
