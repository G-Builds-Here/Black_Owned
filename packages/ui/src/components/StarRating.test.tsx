import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating } from './StarRating';
import styles from './StarRating.module.css';

describe('StarRating', () => {
  it('renders correct number of stars for rating', () => {
    render(<StarRating rating={3} />);

    const stars = screen.getAllByRole('img');
    expect(stars).toHaveLength(5);
  });

  it('displays filled stars correctly', () => {
    const { container } = render(<StarRating rating={3} />);

    const filledStars = container.querySelectorAll(`.${styles.star}.${styles.filled}`);
    const emptyStars = container.querySelectorAll(`.${styles.star}:not(.${styles.filled})`);

    expect(filledStars).toHaveLength(3);
    expect(emptyStars).toHaveLength(2);
  });

  it('uses custom maxStars when provided', () => {
    const { container } = render(<StarRating rating={2} maxStars={10} />);

    const allStars = container.querySelectorAll(`.${styles.star}`);
    expect(allStars).toHaveLength(10);
  });

  it('is not interactive by default', () => {
    const { container } = render(<StarRating rating={3} />);

    const clickableStars = container.querySelectorAll(`.${styles.clickable}`);
    expect(clickableStars).toHaveLength(0);
  });

  it('becomes clickable when interactive is true', () => {
    const { container } = render(<StarRating rating={3} interactive={true} />);

    const clickableStars = container.querySelectorAll(`.${styles.clickable}`);
    expect(clickableStars).toHaveLength(5);
  });

  it('calls onRatingChange when clicked and interactive', () => {
    const handleRatingChange = vi.fn();
    const { container } = render(
      <StarRating rating={3} interactive={true} onRatingChange={handleRatingChange} />
    );

    const firstStar = container.querySelector(`.${styles.star}`);
    firstStar?.click();

    expect(handleRatingChange).toHaveBeenCalledWith(1);
  });

  it('does not call onRatingChange when not interactive', () => {
    const handleRatingChange = vi.fn();
    const { container } = render(
      <StarRating rating={3} interactive={false} onRatingChange={handleRatingChange} />
    );

    const firstStar = container.querySelector(`.${styles.star}`);
    firstStar?.click();

    expect(handleRatingChange).not.toHaveBeenCalled();
  });

  it('applies cultural gold styling for filled stars', () => {
    const { container } = render(<StarRating rating={3} />);
    const filledStar = container.querySelector(`.${styles.star}.${styles.filled}`);

    expect(filledStar).toBeInTheDocument();
  });

  it('applies clickable class when interactive', () => {
    const { container } = render(<StarRating rating={2} interactive />);
    const clickableStars = container.querySelectorAll(`.${styles.star}.${styles.clickable}`);

    expect(clickableStars).toHaveLength(5);
  });
});
