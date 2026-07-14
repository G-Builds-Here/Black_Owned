import React from 'react';

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
    <div className="star-rating">
      {Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => (
        <span
          key={star}
          className={`star ${star <= rating ? 'filled' : ''} ${interactive ? 'clickable' : ''}`}
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
