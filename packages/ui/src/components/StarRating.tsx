import React from 'react';
import styles from './StarRating.module.css';

export interface StarRatingProps {
  rating: number;
  maxStars?: number;
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  maxStars = 5,
  interactive = false,
  onRatingChange,
}) => {
  const handleClick = (star: number) => {
    if (interactive && onRatingChange) {
      onRatingChange(star);
    }
  };

  return (
    <div className={styles.starRating}>
      {Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => (
        <span
          key={star}
          className={`${styles.star} ${star <= rating ? styles.filled : ''} ${interactive ? styles.clickable : ''}`}
          onClick={() => handleClick(star)}
          role={interactive ? 'button' : 'img'}
          tabIndex={interactive ? 0 : -1}
        >
          {star <= rating ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
};

export default StarRating;
