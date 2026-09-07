/**
 * Business Content Editor Tests — LOC-0080 AC1 (form half)
 *
 * Verifies the admin form pre-fills from the fetched business row and
 * re-renders with the values returned by a successful PATCH.
 */

'use client';

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BusinessContentEditor, { BusinessContent } from './BusinessContentEditor';

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

// Business "b-9" from the Gherkin: phone set, website NULL.
const b9: BusinessContent = {
  id: '6f1e2b3c-4d5e-4f6a-8b7c-9d0e1f2a3b4c',
  name: 'Blue Door Bakery',
  website: null,
  phone: '+15551112222',
  menuUrl: null,
  imageUrl: null,
  description: null,
  socialUrls: null,
};

describe('BusinessContentEditor', () => {
  it('pre-fills the form with the stored phone and an empty website field', () => {
    render(<BusinessContentEditor business={b9} onSaved={jest.fn()} />);

    expect(screen.getByLabelText(/^phone$/i)).toHaveValue('+15551112222');
    expect(screen.getByLabelText(/^website$/i)).toHaveValue('');
    expect(screen.getByText('Blue Door Bakery')).toBeInTheDocument();
  });

  it('saves only the changed field and re-renders with the saved value', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { business: { ...b9, website: 'https://example.com' } },
      }),
    });
    const onSaved = jest.fn();
    render(<BusinessContentEditor business={b9} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/^website$/i), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ website: 'https://example.com' }));
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`/api/admin/businesses/${b9.id}/content`);
    expect(init.method).toBe('PATCH');
    // Partial save: only the field the admin changed is sent
    expect(JSON.parse(init.body)).toEqual({ website: 'https://example.com' });

    // Form re-renders showing the saved value
    await waitFor(() => {
      expect(screen.getByLabelText(/^website$/i)).toHaveValue('https://example.com');
    });
    expect(screen.getByText(/content saved/i)).toBeInTheDocument();
  });

  it('keeps phone and description when only menuUrl is saved', async () => {
    const withMenu: BusinessContent = {
      ...b9,
      menuUrl: 'https://example.com/menu',
      description: 'Local bakery',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { business: withMenu } }),
    });
    render(<BusinessContentEditor business={b9} onSaved={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/^menu url$/i), {
      target: { value: 'https://example.com/menu' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
        menuUrl: 'https://example.com/menu',
      });
    });
    expect(screen.getByLabelText(/^phone$/i)).toHaveValue('+15551112222');
  });

  it('shows the API error when the save is rejected', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'website must be at most 255 characters' }),
    });
    render(<BusinessContentEditor business={b9} onSaved={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/^website$/i), {
      target: { value: 'x'.repeat(300) },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/website must be at most 255 characters/i)).toBeInTheDocument();
    });
  });
});
