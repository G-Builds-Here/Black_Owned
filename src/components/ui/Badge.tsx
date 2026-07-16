'use client';

import React, { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Badge variant */
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  /** Size variant */
  size?: 'sm' | 'md';
  /** Pill shape */
  pill?: boolean;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      pill = false,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center font-medium
      transition-colors duration-150
    `;

    const variantStyles = {
      default: `
        bg-neutral-100 text-neutral-700
        border border-neutral-200
      `,
      primary: `
        bg-heritage-ochre/10 text-heritage-ochre
        border border-heritage-ochre/20
      `,
      secondary: `
        bg-heritage-jade/10 text-heritage-jade
        border border-heritage-jade/20
      `,
      success: `
        bg-heritage-jade/10 text-heritage-jade
        border border-heritage-jade/20
      `,
      warning: `
        bg-heritage-amber/10 text-heritage-amber
        border border-heritage-amber/20
      `,
      error: `
        bg-heritage-crimson/10 text-heritage-crimson
        border border-heritage-crimson/20
      `,
      info: `
        bg-heritage-royal/10 text-heritage-royal
        border border-heritage-royal/20
      `,
    };

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs rounded-md',
      md: 'px-2.5 py-1 text-sm rounded-md',
    };

    const shapeStyles = pill ? 'rounded-full' : '';

    return (
      <span
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${shapeStyles} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;
