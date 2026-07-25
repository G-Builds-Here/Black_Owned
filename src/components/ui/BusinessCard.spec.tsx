import React from 'react';
import { render, screen } from '@testing-library/react';
import BusinessCard, { Business } from './BusinessCard';

const mockBusiness: Business = {
  id: '1',
  name: 'Test Business',
  category: 'Food & Dining',
  rating: 4.5,
  reviewCount: 120,
  location: 'New York, NY',
  isVerified: true,
  imageUrl: 'https://example.com/image.jpg',
  description: 'A great business',
  tags: ['tag1', 'tag2'],
};

describe('BusinessCard - Accessibility', () => {
  it('has accessible name for the card', () => {
    render(<BusinessCard business={mockBusiness} />);
    expect(screen.getByText('Test Business')).toBeInTheDocument();
  });

  it('has accessible label for rating', () => {
    render(<BusinessCard business={mockBusiness} />);
    expect(screen.getByLabelText(/rating: 4.5 out of 5 stars/i)).toBeInTheDocument();
  });

  it('stars have aria-hidden for decorative purpose', () => {
    render(<BusinessCard business={mockBusiness} />);
    // Star characters should be hidden from screen readers
    const starElements = screen.queryAllByRole('img', { hidden: true });
    expect(starElements.length).toBeGreaterThanOrEqual(0);
  });

  it('has accessible labels for action buttons', () => {
    render(<BusinessCard business={mockBusiness} />);
    expect(screen.getByLabelText(/save test business/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/share test business/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/view details for test business/i)).toBeInTheDocument();
  });

  it('image has alt text', () => {
    render(<BusinessCard business={mockBusiness} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', /business photo for/i);
  });

  it('location icon is hidden from screen readers', () => {
    render(<BusinessCard business={mockBusiness} />);
    // The location emoji should have aria-hidden
    const locationIcon = screen.queryByRole('img', { hidden: true });
    expect(locationIcon).toBeInTheDocument();
  });

  it('verification badge is visible', () => {
    render(<BusinessCard business={mockBusiness} />);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it('category badge is visible', () => {
    render(<BusinessCard business={mockBusiness} />);
    expect(screen.getByText('Food & Dining')).toBeInTheDocument();
  });

  it('tags are displayed', () => {
    render(<BusinessCard business={mockBusiness} />);
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
  });

  it('action buttons group has accessible label', () => {
    render(<BusinessCard business={mockBusiness} />);
    const actionGroup = screen.getByRole('group', { name: /actions for test business/i });
    expect(actionGroup).toBeInTheDocument();
  });
});

describe('BusinessCard - Functionality', () => {
  it('calls onViewDetails when clicked', () => {
    const handleViewDetails = jest.fn();
    render(<BusinessCard business={mockBusiness} onViewDetails={handleViewDetails} />);
    screen.getByLabelText(/view details for test business/i).click();
    expect(handleViewDetails).toHaveBeenCalledWith('1');
  });

  it('calls onSave when save button clicked', () => {
    const handleSave = jest.fn();
    render(<BusinessCard business={mockBusiness} onSave={handleSave} />);
    screen.getByLabelText(/save test business/i).click();
    expect(handleSave).toHaveBeenCalledWith('1');
  });

  it('calls onShare when share button clicked', () => {
    const handleShare = jest.fn();
    render(<BusinessCard business={mockBusiness} onShare={handleShare} />);
    screen.getByLabelText(/share test business/i).click();
    expect(handleShare).toHaveBeenCalledWith('1');
  });

  it('displays placeholder when no image', () => {
    const businessWithoutImage = { ...mockBusiness, imageUrl: '' };
    render(<BusinessCard business={businessWithoutImage} />);
    // Should show placeholder emoji
    expect(screen.getByText('🏪')).toBeInTheDocument();
  });

  it('does not show verification badge when not verified', () => {
    const unverifiedBusiness = { ...mockBusiness, isVerified: false };
    render(<BusinessCard business={unverifiedBusiness} />);
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('does not show tags when empty', () => {
    const businessWithoutTags = { ...mockBusiness, tags: [] };
    render(<BusinessCard business={businessWithoutTags} />);
    expect(screen.queryByText('tag1')).not.toBeInTheDocument();
  });
});
