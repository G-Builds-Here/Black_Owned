'use client';

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchBar } from './SearchBar';

// Mock timers for debounce testing
jest.useFakeTimers();

describe('SearchBar', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('renders with default placeholder', () => {
    render(<SearchBar />);
    expect(screen.getByPlaceholderText(/search for businesses/i)).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<SearchBar placeholder="Search for something else" />);
    expect(screen.getByPlaceholderText(/search for something else/i)).toBeInTheDocument();
  });

  it('renders default categories', () => {
    render(<SearchBar />);
    expect(screen.getByText(/all/i)).toBeInTheDocument();
    expect(screen.getByText(/food & dining/i)).toBeInTheDocument();
    expect(screen.getByText(/professional services/i)).toBeInTheDocument();
  });

  it('renders custom categories', () => {
    const categories = ['Cat A', 'Cat B', 'Cat C'];
    render(<SearchBar categories={categories} />);
    expect(screen.getByText(/cat a/i)).toBeInTheDocument();
    expect(screen.getByText(/cat b/i)).toBeInTheDocument();
  });

  it('renders search button', () => {
    render(<SearchBar />);
    expect(screen.getByRole('button', { name: /submit search/i })).toBeInTheDocument();
  });

  it('renders clear button', () => {
    render(<SearchBar />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('updates search query on input change', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'test query' } });
    expect(input).toHaveValue('test query');
  });

  it('calls onSearch when search button is clicked', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} />);
    fireEvent.click(screen.getByRole('button', { name: /submit search/i }));
    expect(handleSearch).toHaveBeenCalledTimes(1);
  });

  it('calls onSearch with query and filters', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: /submit search/i }));
    expect(handleSearch).toHaveBeenCalledWith('test', []);
  });

  it('toggles category filter on click', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} categories={['Cat A', 'Cat B']} />);
    const catA = screen.getByText(/cat a/i);
    fireEvent.click(catA);
    expect(catA).toHaveClass('bg-heritage-ochre');
    expect(catA).toHaveAttribute('aria-pressed', 'true');
  });

  it('deselects category filter on second click', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} categories={['Cat A', 'Cat B']} />);
    const catA = screen.getByText(/cat a/i);
    fireEvent.click(catA);
    fireEvent.click(catA);
    expect(catA).not.toHaveClass('bg-heritage-ochre');
    expect(catA).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSearch when Enter key is pressed', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(handleSearch).toHaveBeenCalledWith('test', []);
  });

  it('clears search on clear button click', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(input).toHaveValue('');
  });

  it('calls onSearch with empty values on clear', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(handleSearch).toHaveBeenCalledWith('', []);
  });

  it('does not include "All" in filters', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} categories={['All', 'Cat A']} />);
    const catA = screen.getByText(/cat a/i);
    fireEvent.click(catA);
    fireEvent.click(screen.getByRole('button', { name: /submit search/i }));
    expect(handleSearch).toHaveBeenCalledWith('', ['Cat A']);
  });

  it('has proper accessibility attributes', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    expect(input).toHaveAttribute('aria-label', 'Search businesses');
  });

  it('has search button with aria-label', () => {
    render(<SearchBar />);
    expect(screen.getByRole('button', { name: /submit search/i })).toBeInTheDocument();
  });

  it('has clear button with aria-label', () => {
    render(<SearchBar />);
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument();
  });

  it('has category filter group with role', () => {
    render(<SearchBar />);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  // Autocomplete and debounce tests
  it('shows suggestions dropdown when typing', async () => {
    const customSuggestions = ['Coffee', 'Coffee Shop', 'Cafe', 'Tea', 'Bakery'];
    render(<SearchBar suggestions={customSuggestions} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'c' } });

    // Advance debounce timer
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument();
      expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
      expect(screen.getByText('Cafe')).toBeInTheDocument();
    });
  });

  it('filters suggestions based on input query', async () => {
    const customSuggestions = ['Coffee', 'Coffee Shop', 'Tea', 'Bakery', 'Restaurant'];
    render(<SearchBar suggestions={customSuggestions} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'coffee' } });

    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument();
      expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
      expect(screen.queryByText('Tea')).not.toBeInTheDocument();
    });
  });

  it('limits suggestions to maxSuggestions (default 5)', async () => {
    const manySuggestions = ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6', 'Item 7', 'Item 8', 'Item 9', 'Item 10'];
    render(<SearchBar suggestions={manySuggestions} maxSuggestions={5} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'item' } });

    jest.advanceTimersByTime(300);

    await waitFor(() => {
      const suggestionItems = screen.getAllByRole('option');
      expect(suggestionItems.length).toBe(5);
    });
  });

  it('hides suggestions when input is cleared', async () => {
    const customSuggestions = ['Coffee', 'Tea', 'Bakery'];
    render(<SearchBar suggestions={customSuggestions} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'c' } });
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument();
    });

    fireEvent.change(input, { target: { value: '' } });
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
    });
  });

  it('selects suggestion on click and updates input', async () => {
    const customSuggestions = ['Coffee', 'Coffee Shop', 'Tea'];
    const handleSearch = jest.fn();
    render(<SearchBar suggestions={customSuggestions} onSearch={handleSearch} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'cof' } });
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Coffee'));

    expect(input).toHaveValue('Coffee');
    expect(handleSearch).toHaveBeenCalledWith('Coffee', []);
  });

  it('closes suggestions on Escape key', async () => {
    const customSuggestions = ['Coffee', 'Tea'];
    render(<SearchBar suggestions={customSuggestions} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'c' } });
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
    });
  });

  it('does not show suggestions when no matches found', async () => {
    const customSuggestions = ['Coffee', 'Tea', 'Bakery'];
    render(<SearchBar suggestions={customSuggestions} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'xyz123' } });
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('debounces suggestion filtering - does not show immediately', async () => {
    const customSuggestions = ['Coffee', 'Tea'];
    render(<SearchBar suggestions={customSuggestions} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'c' } });

    // Before debounce timer fires
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // After debounce timer fires
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument();
    });
  });

  it('accepts custom debounce delay', async () => {
    const customSuggestions = ['Coffee', 'Tea'];
    render(<SearchBar suggestions={customSuggestions} debounceMs={500} />);

    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'c' } });

    // Before 500ms
    jest.advanceTimersByTime(300);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // After 500ms
    jest.advanceTimersByTime(200);

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument();
    });
  });

  it('has autocomplete accessibility attributes', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('role', 'combobox');
  });
});
