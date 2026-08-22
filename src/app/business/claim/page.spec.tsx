/**
 * /business/claim wizard tests
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ClaimBusinessPage from './page';

const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

global.fetch = jest.fn();

const SESSION = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user: { id: 'u-1', email: 'owner@example.com', name: 'Owner' },
};

const CATEGORIES = {
  success: true,
  data: {
    categories: [
      { id: 'cat-food', name: 'Food & Dining' },
      { id: 'cat-retail', name: 'Retail & Fashion' },
    ],
  },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/** Prime the categories fetch (always fired on mount). */
function mockCategories() {
  (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, CATEGORIES));
}

/** Wait until the category options are actually rendered before interacting. */
async function categoriesLoaded() {
  await screen.findByRole('option', { name: 'Food & Dining' });
}

async function fillStepOne() {
  fireEvent.change(screen.getByLabelText(/Business Name/), {
    target: { value: 'Soul Kitchen' },
  });
  await categoriesLoaded();
  fireEvent.change(screen.getByLabelText(/^Category/), {
    target: { value: 'cat-food' },
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  );
}

describe('ClaimBusinessPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    (global.fetch as jest.Mock).mockReset();
  });

  it('shows step 1 with the real category options and a gated Next button', async () => {
    mockCategories();

    render(<ClaimBusinessPage />);

    const select = await screen.findByLabelText(/^Category/);
    await categoriesLoaded();
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Select a category',
      'Food & Dining',
      'Retail & Fashion',
    ]);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(select).toBeDefined();
  });

  it('moves to the ownership step, which is gated on the checkbox', async () => {
    mockCategories();
    render(<ClaimBusinessPage />);
    await fillStepOne();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText(/Confirm Ownership/)).toBeInTheDocument();
    expect(screen.getByText(/I own or operate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/I confirm that I own or operate/));
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText(/Business Name/)).toBeInTheDocument();
  });

  it('asks for an account when there is no session', async () => {
    mockCategories();
    render(<ClaimBusinessPage />);
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText(/I own or operate/);
    fireEvent.click(screen.getByLabelText(/I confirm that I own or operate/));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Sign In to Submit')).toBeInTheDocument();
    const signIn = screen.getByRole('link', { name: 'Sign In' });
    const register = screen.getByRole('link', { name: 'Create Account' });
    expect(signIn).toHaveAttribute('href', '/login');
    expect(register).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('button', { name: 'Submit Claim' })).not.toBeInTheDocument();
  });

  it('submits the claim with the session token and shows the success card', async () => {
    window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
    mockCategories();
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(201, {
        success: true,
        data: {
          business: {
            id: 'b-1',
            name: 'Soul Kitchen',
            categoryId: 'cat-food',
            status: 'unverified',
          },
        },
      })
    );

    render(<ClaimBusinessPage />);
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/I own or operate/);
    fireEvent.click(screen.getByLabelText(/I confirm that I own or operate/));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText(/Signing in as/)).toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Claim' }));

    expect(await screen.findByText(/Soul Kitchen has been claimed/)).toBeInTheDocument();
    expect(screen.getByText('Go to My Dashboard')).toBeInTheDocument();

    const claimCall = (global.fetch as jest.Mock).mock.calls.find(
      (call) => String(call[0]).includes('/api/businesses/claim')
    );
    expect(claimCall).toBeDefined();
    const init = claimCall![1] as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer access');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Soul Kitchen',
      categoryId: 'cat-food',
    });
  });

  it('clears the session and asks for sign-in when the token is rejected', async () => {
    window.localStorage.setItem('black-owned.session', JSON.stringify(SESSION));
    mockCategories();
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { success: false, error: 'unauthenticated' })
    );

    render(<ClaimBusinessPage />);
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/I own or operate/);
    fireEvent.click(screen.getByLabelText(/I confirm that I own or operate/));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText(/Signing in as/);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Claim' }));

    await waitFor(() =>
      expect(
        screen.getByText(/Your session expired/)
      ).toBeInTheDocument()
    );
    expect(window.localStorage.getItem('black-owned.session')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit Claim' })).not.toBeInTheDocument();
  });
});
