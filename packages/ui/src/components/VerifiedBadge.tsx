import React from 'react';
import styles from './VerifiedBadge.module.css';

export interface VerifiedBadgeProps {
  verified?: boolean;
  label?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  verified = true,
  label,
}) => {
  return (
    <span className={`${styles.verifiedBadge} ${verified ? styles.verified : styles.unverified}`}>
      {verified ? '✓' : '○'}
      {label && <span className={styles.badgeLabel}>{label}</span>}
    </span>
  );
};

export default VerifiedBadge;
