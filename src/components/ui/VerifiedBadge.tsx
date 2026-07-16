'use client';

import React, { HTMLAttributes, forwardRef } from 'react';

export interface VerifiedBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Label text */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show checkmark icon */
  showIcon?: boolean;
  /** Custom icon */
  icon?: React.ReactNode;
}

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

/**
 * VerifiedBadge - Displays a verification status badge
 * Used to indicate verified businesses, users, or content
 * Fully accessible with proper ARIA labels
 */
export const VerifiedBadge = forwardRef<HTMLSpanElement, VerifiedBadgeProps>(
  (
    {
      label = 'Verified',
      size = 'md',
      showIcon = true,
      icon,
      className = '',
      ...props
    },
    ref
  ) => {
    const defaultIcon = (
      <svg
        className="w-3 h-3"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );

    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center gap-1
          bg-green-600 text-white
          rounded-full
          font-medium
          ${sizeStyles[size]}
          ${className}
        `}
        role="status"
        aria-label={label}
        {...props}
      >
        {showIcon && (icon || defaultIcon)}
        {label}
      </span>
    );
  }
);

VerifiedBadge.displayName = 'VerifiedBadge';

export default VerifiedBadge;
