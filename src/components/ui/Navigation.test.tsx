/**
 * LOC-0094 AC1/AC2 — session-aware Navigation header render states.
 *
 * The header reads the client session store (localStorage), never the
 * httpOnly cookie it cannot see. Anonymous visitors keep Sign in /
 * Register; a signed-in user sees their name and Sign out.
 */

import { render, screen } from '@testing-library/react';
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

function seedSession() {
  window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
}

describe('Navigation session states (LOC-0094)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  describe('AC1: anonymous header', () => {
    it('shows Sign in and Register links for a visitor with no session', async () => {
      render(<Navigation />);
      expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        '/login'
      );
      expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute(
        'href',
        '/register'
      );
    });

    it('shows no user name and no Sign out control', async () => {
      render(<Navigation />);
      // Wait for the session-read effect to settle before asserting absence.
      await screen.findByRole('link', { name: 'Sign in' });
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
      expect(screen.queryByText('Bruce')).toBeNull();
    });
  });

  describe('AC2: logged-in header', () => {
    it("shows the user's name and a Sign out control", async () => {
      seedSession();
      render(<Navigation />);
      expect(await screen.findByText('Bruce')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    });

    it('removes the Sign in and Register links', async () => {
      seedSession();
      render(<Navigation />);
      await screen.findByText('Bruce');
      expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Register' })).toBeNull();
    });
  });
});
