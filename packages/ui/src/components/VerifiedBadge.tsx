import React from 'react';

export interface VerifiedBadgeProps {
  verified?: boolean;
  label?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  verified = true,
  label,
}) => {
  return (
    <span className={`verified-badge ${verified ? 'verified' : 'unverified'}`}>
      {verified ? '✓' : '○'}
      {label && <span className="badge-label">{label}</span>}
    </span>
  );
};

export default VerifiedBadge;
