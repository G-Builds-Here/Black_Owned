import React from 'react';

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
    <div className="business-card">
      <h2>{businessName}</h2>
      <p className="rating">{rating.toFixed(1)}</p>
      {description && <p className="description">{description}</p>}
      {address && <p className="address">{address}</p>}
    </div>
  );
};

export default BusinessCard;
