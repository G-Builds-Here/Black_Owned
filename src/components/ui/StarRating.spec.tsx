import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating } from './StarRating';

describe('StarRating', () => {
  const defaultProps = {
    rating: 4,
    maxRating: 5,
  };

  it('renders the correct number of stars', () => {
    render(<StarRating {...defaultProps} />);
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
  });

  it('displays the correct rating', () => {
    render(<StarRating {...defaultProps} showRating />);
    expect(screen.getByText('4.0')).toBeInTheDocument();
  });

  it('displays review count when provided', () => {
    render(<StarRating {...defaultProps} showRating reviewCount={156} />);
    expect(screen.getByText('(156)')).toBeInTheDocument();
  });

  it('renders filled stars correctly', () => {
    const { container } = render(<StarRating rating={3} />);
    const filledStars = container.querySelectorAll('.text-heritage-ochre');
    expect(filledStars).toHaveLength(3);
  });

  it('renders empty stars correctly', () => {
    const { container } = render(<StarRating rating={2} />);
    const emptyStars = container.querySelectorAll('.text-neutral-300');
    expect(emptyStars).toHaveLength(3); // 5 - 2 = 3 empty stars
  });

  it('supports different size variants', () => {
    const { container: small } = render(<StarRating {...defaultProps} size="sm" />);
    const { container: large } = render(<StarRating {...defaultProps} size="lg" />);

    expect(small.querySelector('button')).toHaveClass('text-sm');
    expect(large.querySelector('button')).toHaveClass('text-xl');
  });

  it('calls onRatingChange when interactive and clicked', () => {
    const handleRatingChange = jest.fn();
    render(
      <StarRating
        {...defaultProps}
        interactive
        onRatingChange={handleRatingChange}
        rating={0}
      />
    );

    const thirdStar = screen.getAllByRole('radio')[2];
    fireEvent.click(thirdStar);

    expect(handleRatingChange).toHaveBeenCalledWith(3);
  });

  it('handles hover state in interactive mode', () => {
    const { container } = render(
      <StarRating
        {...defaultProps}
        interactive
        onRatingChange={jest.fn()}
        rating={2}
      />
    );

    const stars = container.querySelectorAll('button');
    fireEvent.mouseEnter(stars[4]);

    // Should show 5 stars on hover
    expect(stars[4]).toHaveClass('text-heritage-ochre');
  });

  it('resets hover state on mouse leave', () => {
    const { container } = render(
      <StarRating
        {...defaultProps}
        interactive
        onRatingChange={jest.fn()}
        rating={2}
      />
    );

    const stars = container.querySelectorAll('button');
    fireEvent.mouseEnter(stars[4]);
    fireEvent.mouseLeave(stars[4]);

    // Should reset to original rating (2 filled, 3 empty)
    expect(stars[2]).toHaveClass('text-neutral-300');
  });

  it('handles keyboard navigation in interactive mode', () => {
    const handleRatingChange = jest.fn();
    render(
      <StarRating
        {...defaultProps}
        interactive
        onRatingChange={handleRatingChange}
        rating={2}
      />
    );

    const firstStar = screen.getAllByRole('radio')[0];

    // Test right arrow
    fireEvent.keyDown(firstStar, { key: 'ArrowRight' });
    expect(handleRatingChange).toHaveBeenCalledWith(2);

    // Test left arrow
    fireEvent.keyDown(firstStar, { key: 'ArrowLeft' });
    expect(handleRatingChange).toHaveBeenCalledWith(1);

    // Test enter key
    fireEvent.keyDown(firstStar, { key: 'Enter' });
    expect(handleRatingChange).toHaveBeenCalledWith(1);

    // Test space key
    fireEvent.keyDown(firstStar, { key: ' ' });
    expect(handleRatingChange).toHaveBeenCalledWith(1);
  });

  it('does not allow rating above maxRating', () => {
    const handleRatingChange = jest.fn();
    render(
      <StarRating
        rating={0}
        maxRating={3}
        interactive
        onRatingChange={handleRatingChange}
      />
    );

    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(3);
  });

  it('does not allow rating below 1', () => {
    const handleRatingChange = jest.fn();
    render(
      <StarRating
        rating={1}
        maxRating={5}
        interactive
        onRatingChange={handleRatingChange}
      />
    );

    const firstStar = screen.getAllByRole('radio')[0];
    fireEvent.keyDown(firstStar, { key: 'ArrowLeft' });

    // Should not go below 1
    expect(handleRatingChange).not.toHaveBeenCalledWith(0);
  });

  it('has proper ARIA labels for accessibility', () => {
    render(<StarRating rating={4} />);

    const starRating = screen.getByRole('img');
    expect(starRating).toHaveAttribute('aria-label', 'Rating: 4 out of 5 stars');
  });

  it('has proper ARIA labels for interactive mode', () => {
    render(<StarRating rating={4} interactive />);

    const radioGroup = screen.getByRole('radiogroup');
    expect(radioGroup).toHaveAttribute('aria-label', 'Rate this item');
  });

  it('supports custom star icons', () => {
    const customIcons = {
      filled: '★',
      empty: '☆',
      half: '⯪',
    };

    const { container } = render(
      <StarRating rating={3} starIcon={customIcons} />
    );

    expect(container.textContent).toContain('★');
  });

  it('applies custom className', () => {
    const { container } = render(
      <StarRating {...defaultProps} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
