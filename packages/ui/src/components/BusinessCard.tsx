import React from 'react';
import styles from './BusinessCard.module.css';

export interface BusinessCardProps {
  businessName: string;
  rating: number;
  description?: string;
  address?: string;
}

export const BusinessCard: React.FC<BusinessCardProps> = ({
  businessName,
  rating,
  description,
  address,
}) => {
  return (
    <div className={styles.businessCard}>
      <h2>{businessName}</h2>
      <p className={styles.rating}>{rating.toFixed(1)}</p>
      {description && <p className={styles.description}>{description}</p>}
      {address && <p className={styles.address}>{address}</p>}
    </div>
  );
};

export default BusinessCard;
