'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BusinessCard, { Business } from './BusinessCard';

// Current component notes (source of truth: BusinessCard.tsx + Card.tsx):
// - The card wrapper is Card's root div (no testids): rounded-xl shadow-soft
//   flex flex-col cursor-pointer (variant "elevated", clickable).
// - The verified badge renders a "✓" glyph (no "verified" text).
// - The image is a left w-40 column (OpenDoor-style horizontal card; the
//   placeholder shows a 🏪 emoji when imageUrl is empty); rating sits in a
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

  const cardRoot = (container: HTMLElement) => container.firstChild as HTMLElement;

  it('renders business name', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText('Test Business')).toBeInTheDocument();
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

  it('renders rating stars with accessible label', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(
      container.querySelector('[aria-label="Rating: 4.5 out of 5 stars"]')
    ).toBeInTheDocument();
  });

  it('renders review count', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/\(100\)/i)).toBeInTheDocument();
  });

  it('shows verified badge when isVerified is true', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const badge = screen.getByText('✓');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-600');
  });

  it('does not show verified badge when isVerified is false', () => {
    const unverifiedBusiness = { ...mockBusiness, isVerified: false };
    render(<BusinessCard business={unverifiedBusiness} onViewDetails={jest.fn()} />);
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
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
    // With enableLink the Card renders inside an <a>; the clickable styles
    // live on the card div the link wraps.
    const link = container.querySelector('a');
    const card = link.firstElementChild as HTMLElement;
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
    expect(cardRoot(container)).toHaveClass('rounded-xl');
  });

  it('has shadow', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(cardRoot(container)).toHaveClass('shadow-soft');
  });

  it('has flex column layout', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(cardRoot(container)).toHaveClass('flex');
    expect(cardRoot(container)).toHaveClass('flex-col');
  });

  it('has a left image column', () => {
    const { container } = render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const imageContainer = container.querySelector('.bg-neutral-200') as HTMLElement;
    expect(imageContainer).toHaveClass('w-40');
    expect(imageContainer).toHaveClass('overflow-hidden');
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

  it('renders image with cover fit', () => {
    const businessWithImage = { ...mockBusiness, imageUrl: 'https://example.com/image.jpg' };
    render(<BusinessCard business={businessWithImage} onViewDetails={jest.fn()} />);
    const img = screen.getByAltText(/business photo/i) as HTMLElement;
    // The old hover-scale effect was removed; the image is a static cover crop.
    expect(img).toHaveClass('object-cover');
    expect(img).toHaveClass('w-full');
  });

  it('has padding', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const content = screen.getByText('Test Business').closest('.flex-grow') as HTMLElement;
    expect(content).toHaveClass('p-3');
  });

  it('has border top for action buttons', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const actions = screen.getByRole('button', { name: /view details/i }).parentElement as HTMLElement;
    expect(actions).toHaveClass('border-t');
    expect(actions).toHaveClass('border-neutral-200');
  });

  it('has flex gap for action buttons', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const actions = screen.getByRole('button', { name: /view details/i }).parentElement as HTMLElement;
    expect(actions).toHaveClass('flex');
    expect(actions).toHaveClass('gap-2');
  });

  it('has line clamp for description', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    expect(screen.getByText(/a test business description/i)).toHaveClass('line-clamp-2');
  });

  it('has font-semibold for business name', () => {
    render(<BusinessCard business={mockBusiness} onViewDetails={jest.fn()} />);
    const name = screen.getByText('Test Business');
    expect(name).toHaveClass('font-semibold');
    expect(name).toHaveClass('text-lg');
  });
});
