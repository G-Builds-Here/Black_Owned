/**
 * Business Review Page Tests
 *
 * The page loads its queue from GET /api/pending-businesses (bare JSON array).
 * These tests mock fetch and verify mapping, filtering, empty/error states,
 * and the detail modal.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BusinessReviewPage from './page';

const pendingRows = [
  {
    id: 'b-1',
    name: 'Soul Food Kitchen',
    address: '123 Main St, Atlanta GA',
    source: 'google-maps',
    rating: 4.5,
    status: 'pending_review',
    createdAt: '2026-07-14T12:00:00.000Z',
    categoryId: 'Restaurant',
    description: 'Authentic soul food restaurant',
    sourceData: {
      address: '123 Main St, Atlanta GA',
      phone: '(404) 555-0123',
      website: 'https://soulfoodkitchen.example.com',
      rating: 4.5,
    },
  },
  {
    id: 'b-2',
    name: 'Afro Threads',
    address: '456 Oak Ave, Houston TX',
    source: 'yelp',
    rating: null,
    status: 'pending_review',
    createdAt: '2026-07-13T09:30:00.000Z',
    categoryId: 'Retail',
    sourceData: { address: '456 Oak Ave, Houston TX' },
  },
];

const mockFetch = jest.fn();

describe('BusinessReviewPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  it('renders the page header', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    render(<BusinessReviewPage />);
    expect(
      await screen.findByRole('heading', { name: /Business Review Queue/i })
    ).toBeInTheDocument();
  });

  it('displays pending businesses fetched from the API as cards', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    expect(await screen.findByText('Soul Food Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Afro Threads')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Atlanta GA')).toBeInTheDocument();
    expect(screen.getByText('456 Oak Ave, Houston TX')).toBeInTheDocument();
    expect(screen.getByText('google-maps')).toBeInTheDocument();
    expect(screen.getByText('yelp')).toBeInTheDocument();
  });

  it('shows the count of businesses pending review', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    await screen.findByText('Soul Food Kitchen');
    expect(screen.getByText(/2 businesses pending review/i)).toBeInTheDocument();
  });

  it('shows "No rating" when a business has no rating', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    await screen.findByText('Afro Threads');
    expect(screen.getByText('No rating')).toBeInTheDocument();
    // The 4.5-rated business shows its numeric rating
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('displays the submitted date on each card', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    await screen.findByText('Soul Food Kitchen');
    expect(screen.getByText(/2026-07-14/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-13/)).toBeInTheDocument();
  });

  it('filters businesses when search query is entered', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    const searchInput = await screen.findByPlaceholderText(/Search by name, address, or source/i);
    fireEvent.change(searchInput, { target: { value: 'Soul Food' } });

    expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
    expect(screen.queryByText('Afro Threads')).not.toBeInTheDocument();
  });

  it('shows empty state when no businesses match search', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    const searchInput = await screen.findByPlaceholderText(/Search by name, address, or source/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistentbusiness12345' } });

    expect(screen.getByText(/No businesses found matching your search/i)).toBeInTheDocument();
  });

  it('shows empty state when the API returns no pending businesses', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    render(<BusinessReviewPage />);

    await screen.findByText(/No businesses pending review/i);
  });

  it('shows a load error when the API request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    render(<BusinessReviewPage />);

    await screen.findByText(/Failed to load pending businesses/i);
  });

  it('shows a load error when the API returns a non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) });
    render(<BusinessReviewPage />);

    await screen.findByText(/Failed to load pending businesses/i);
  });

  it('opens the detail modal when clicking a business card', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    const card = await screen.findByText('Soul Food Kitchen');
    fireEvent.click(card);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // "Pending Review" appears in the title badge and the status field
    expect(screen.getAllByText('Pending Review').length).toBeGreaterThanOrEqual(1);
  });

  it('displays business fields in the detail modal', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    fireEvent.click(await screen.findByText('Soul Food Kitchen'));
    await screen.findByRole('dialog');

    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByText('Source Information')).toBeInTheDocument();
    expect(screen.getByText('Original Scraped Data')).toBeInTheDocument();
    expect(screen.getByText('b-1')).toBeInTheDocument();
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    expect(screen.getByText(/Authentic soul food restaurant/i)).toBeInTheDocument();
    expect(screen.getByText('(404) 555-0123')).toBeInTheDocument();
    expect(screen.getByText('https://soulfoodkitchen.example.com')).toBeInTheDocument();
    expect(screen.getByText('2026-07-14')).toBeInTheDocument();
  });

  it('shows N/A for missing phone and website', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    fireEvent.click(await screen.findByText('Afro Threads'));
    await screen.findByRole('dialog');

    // Afro Threads sourceData has no phone or website
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(2);
  });

  it('shows approve, reject and close buttons in the detail modal', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    fireEvent.click(await screen.findByText('Soul Food Kitchen'));
    await screen.findByRole('dialog');

    // Exact name: the page header also has an "Approve Selected" button
    expect(screen.getByRole('button', { name: 'Approve', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject', exact: true })).toBeInTheDocument();
    // Exact name: the icon button's accessible name is "Close modal"
    expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeInTheDocument();
  });

  it('closes the detail modal when clicking the close button', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => pendingRows });
    render(<BusinessReviewPage />);

    fireEvent.click(await screen.findByText('Soul Food Kitchen'));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
