'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
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
    expect(screen.getByText(/cat c/i)).toBeInTheDocument();
  });

  it('renders search button', () => {
    render(<SearchBar />);
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(handleSearch).toHaveBeenCalledTimes(1);
  });

  it('calls onSearch with query and filters', () => {
    const handleSearch = jest.fn();
    render(<SearchBar onSearch={handleSearch} />);
    const input = screen.getByPlaceholderText(/search for businesses/i);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
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

  it('category filter buttons have aria-pressed attribute', () => {
    render(<SearchBar />);
    const categoryButton = screen.getByText(/all/i);
    expect(categoryButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('selected category has aria-pressed true', () => {
    render(<SearchBar />);
    const categoryButton = screen.getByText(/all/i);
    fireEvent.click(categoryButton);
    expect(categoryButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('category filter group has accessible label', () => {
    render(<SearchBar />);
    const filterGroup = screen.getByRole('group', { name: /category filters/i });
    expect(filterGroup).toBeInTheDocument();
  });
});
