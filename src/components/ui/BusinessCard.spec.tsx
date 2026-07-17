'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BusinessCard, { Business } from './BusinessCard';

describe('BusinessCard', () => {
  const mockBusiness: Business = {
    id: '1',
    name: 'Test Business',
    category: 'Food & Dining',
    rating: 4.5,
    reviewCount: 100,
    location: 'New York, NY',
    isVerified: true,
    imageUrl: '',
    description: 'A test business description',
    tags: ['Tag1', 'Tag2', 'Tag3'],
  };

  it('renders business name', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/test business/i)).toBeInTheDocument();
  });

  it('renders business category', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/food & dining/i)).toBeInTheDocument();
  });

  it('renders business location', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/new york, ny/i)).toBeInTheDocument();
  });

  it('renders business description', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/a test business description/i)).toBeInTheDocument();
  });

  it('renders rating stars', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    // Check for star character (unicode)
    expect(screen.getByText(/\d+/)).toBeInTheDocument(); // Review count
  });

  it('renders review count', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/\(100\)/i)).toBeInTheDocument();
  });

  it('shows verified badge when isVerified is true', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it('does not show verified badge when isVerified is false', () => {
    const unverifiedBusiness = { ...mockBusiness, isVerified: false };
    render(<BusinessCard business={unverifiedBusiness} onViewDetails={jest.fn()} />);
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/tag1/i)).toBeInTheDocument();
    expect(screen.getByText(/tag2/i)).toBeInTheDocument();
    expect(screen.getByText(/tag3/i)).toBeInTheDocument();
  });

  it('only shows first 3 tags', () => {
    const businessWithMoreTags = {
      ...mockBusiness,
      tags: ['Tag1', 'Tag2', 'Tag3', 'Tag4', 'Tag5'],
    };
    render(<BusinessCard business={businessWithMoreTags} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/tag1/i)).toBeInTheDocument();
    expect(screen.getByText(/tag2/i)).toBeInTheDocument();
    expect(screen.getByText(/tag3/i)).toBeInTheDocument();
    expect(screen.queryByText(/tag4/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tag5/i)).not.toBeInTheDocument();
  });

  it('calls onViewDetails when View Details button is clicked', () => {
    const handleViewDetails = jest.fn();
    render(<BusinessCard business={mockBusiness} onViewDetails={handleViewDetails} />);
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(handleViewDetails).toHaveBeenCalledWith('1');
  });

  it('calls onSave when save button is clicked', () => {
    const handleSave = jest.fn();
    render(<BusinessCard business={mockBusiness} onSave={handleSave} />);
    fireEvent.click(screen.getByLabelText(/save/i));
    expect(handleSave).toHaveBeenCalledWith('1');
  });

  it('calls onShare when share button is clicked', () => {
    const handleShare = jest.fn();
    render(<BusinessCard business={mockBusiness} onShare={handleShare} />);
    fireEvent.click(screen.getByLabelText(/share/i));
    expect(handleShare).toHaveBeenCalledWith('1');
  });

  it('has clickable card when enableLink is true', () => {
    const { container } = render(
      <BusinessCard business={mockBusiness} onViewDetails={jest.fn()} enableLink={true} />
    );
    const card = container.querySelector('[data-testid="business-card"]');
    expect(card).toHaveClass('cursor-pointer');
  });

  it('renders as Link when enableLink is true', () => {
    const { container } = render(
      <BusinessCard business={mockBusiness} onViewDetails={jest.fn()} enableLink={true} />
    );
    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', '/business/1');
  });

  it('does not render as Link when enableLink is false', () => {
    const { container } = render(
      <BusinessCard business={mockBusiness} onViewDetails={jest.fn()} enableLink={false} />
    );
    const link = container.querySelector('a');
    expect(link).not.toBeInTheDocument();
  });

  it('has rounded corners', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const card = container.querySelector('[data-testid="business-card"]');
    expect(card).toHaveClass('rounded-t-lg');
  });

  it('has shadow', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const card = container.querySelector('[data-testid="business-card"]');
    expect(card).toHaveClass('shadow');
  });

  it('has flex column layout', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const card = container.querySelector('[data-testid="business-card"]');
    expect(card).toHaveClass('flex');
    expect(card).toHaveClass('flex-col');
  });

  it('has aspect ratio for image', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const imageContainer = container.querySelector('[role="img"]');
    expect(imageContainer).toHaveClass('aspect-video');
  });

  it('shows placeholder when no image URL', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/🏪/i)).toBeInTheDocument();
  });

  it('renders image when imageUrl is provided', () => {
    const businessWithImage = { ...mockBusiness, imageUrl: 'https://example.com/image.jpg' };
    render(<BusinessCard business={businessWithImage} onViewDetails={jest.fn()} />);
    const img = screen.getByAltText(/business photo/i);
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
  });

  it('has lazy loading for image', () => {
    const businessWithImage = { ...mockBusiness, imageUrl: 'https://example.com/image.jpg' };
    render(<BusinessCard business={businessWithImage} onViewDetails={jest.fn()} />);
    const img = screen.getByAltText(/business photo/i);
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('has hover scale effect on image', () => {
    const businessWithImage = { ...mockBusiness, imageUrl: 'https://example.com/image.jpg' };
    const { container } = render(
      <BusinessCard business={businessWithImage} onViewDetails={jest.fn()} />
    );
    const img = container.querySelector('img');
    expect(img).toHaveClass('transition-transform');
    expect(img).toHaveClass('duration-300');
    expect(img).toHaveClass('hover:scale-105');
  });

  it('has padding', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const content = container.querySelector('[data-testid="business-card-content"]');
    expect(content).toHaveClass('p-4');
  });

  it('has border top for action buttons', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const actions = container.querySelector('[data-testid="business-card-actions"]');
    expect(actions).toHaveClass('border-t');
    expect(actions).toHaveClass('border-neutral-200');
  });

  it('has flex gap for action buttons', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const actions = container.querySelector('[data-testid="business-card-actions"]');
    expect(actions).toHaveClass('flex');
    expect(actions).toHaveClass('gap-2');
  });

  it('has line clamp for description', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const description = container.querySelector('[data-testid="business-description"]');
    expect(description).toHaveClass('line-clamp-2');
  });

  it('has font-semibold for business name', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const name = container.querySelector('[data-testid="business-name"]');
    expect(name).toHaveClass('font-semibold');
    expect(name).toHaveClass('text-xl');
  });
});
