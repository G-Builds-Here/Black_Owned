'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Carousel } from './Carousel';

describe('Carousel', () => {
  const mockImages = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg',
  ];

  it('renders single image without controls', () => {
    render(<Carousel images={['https://example.com/single.jpg']} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders multiple images with navigation', () => {
    render(<Carousel images={mockImages} />);

    // Check first image is visible
    expect(screen.getByAltText('Gallery image 1 of 3')).toBeInTheDocument();

    // Check navigation buttons
    expect(screen.getByLabelText('Previous image')).toBeInTheDocument();
    expect(screen.getByLabelText('Next image')).toBeInTheDocument();

    // Check thumbnail navigation
    expect(screen.getByLabelText('Go to image 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to image 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to image 3')).toBeInTheDocument();
  });

  it('navigates to next slide on button click', () => {
    render(<Carousel images={mockImages} />);

    expect(screen.getByAltText('Gallery image 1 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next image'));

    expect(screen.getByAltText('Gallery image 2 of 3')).toBeInTheDocument();
  });

  it('navigates to previous slide on button click', () => {
    render(<Carousel images={mockImages} />);

    fireEvent.click(screen.getByLabelText('Previous image'));

    expect(screen.getByAltText('Gallery image 3 of 3')).toBeInTheDocument();
  });

  it('wraps around from last to first slide', () => {
    render(<Carousel images={mockImages} />);

    // Go to last slide
    fireEvent.click(screen.getByLabelText('Next image'));
    fireEvent.click(screen.getByLabelText('Next image'));

    expect(screen.getByAltText('Gallery image 3 of 3')).toBeInTheDocument();

    // Go to next (should wrap to first)
    fireEvent.click(screen.getByLabelText('Next image'));

    expect(screen.getByAltText('Gallery image 1 of 3')).toBeInTheDocument();
  });

  it('selects slide on thumbnail click', () => {
    render(<Carousel images={mockImages} />);

    fireEvent.click(screen.getByLabelText('Go to image 3'));

    expect(screen.getByAltText('Gallery image 3 of 3')).toBeInTheDocument();
  });

  it('calls onImageSelect callback when slide changes', () => {
    const onImageSelect = jest.fn();
    render(<Carousel images={mockImages} onImageSelect={onImageSelect} />);

    fireEvent.click(screen.getByLabelText('Next image'));

    expect(onImageSelect).toHaveBeenCalledWith(1);
  });

  it('displays empty state when no images provided', () => {
    render(<Carousel images={[]} />);

    expect(screen.getByRole('img', { name: 'No images available' })).toBeInTheDocument();
  });

  it('shows slide counter', () => {
    render(<Carousel images={mockImages} />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('pauses auto-play on mouse enter', () => {
    jest.useFakeTimers();
    const onImageSelect = jest.fn();
    const { container } = render(<Carousel images={mockImages} onImageSelect={onImageSelect} autoPlayInterval={100} />);

    // Initial state
    expect(screen.getByAltText('Gallery image 1 of 3')).toBeInTheDocument();

    // Mouse enter should pause auto-play
    fireEvent.mouseEnter(container.querySelector('.relative.group')!);

    // Wait and verify no auto-navigation occurred
    jest.advanceTimersByTime(200);
    expect(onImageSelect).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
