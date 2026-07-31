'use client';

import React, { HTMLAttributes, forwardRef, ElementType, ReactElement } from 'react';
import Link, { LinkProps } from 'next/link';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card variant */
  variant?: 'elevated' | 'outlined' | 'filled';
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Clickable card */
  clickable?: boolean;
  /** Card header */
  header?: React.ReactNode;
  /** Card footer */
  footer?: React.ReactNode;
  /** Render as a different element (e.g., Link) */
  as?: ElementType;
  /** Link href when as=Link */
  href?: LinkProps['href'];
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'elevated',
      padding = 'md',
      clickable = false,
      header,
      footer,
      children,
      className = '',
      as: Component,
      href,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      rounded-xl transition-all duration-200
      flex flex-col
      text-neutral-900
    `;

    const variantStyles = {
      elevated: `
        bg-white
        shadow-soft hover:shadow-medium
        border border-neutral-200
      `,
      outlined: `
        bg-white
        border-2 border-neutral-200
        hover:border-heritage-ochre
      `,
      filled: `
        bg-neutral-50
        border border-neutral-200
      `,
    };

    const paddingStyles = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    };

    const clickableStyles = clickable
      ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-heritage-ochre focus:ring-offset-2'
      : '';

    const cardContent = (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${clickableStyles} ${className}`}
        {...props}
      >
        {header && (
          <div className={`
            mb-4
            ${padding === 'none' ? '' : ''}
          `}>
            {header}
          </div>
        )}
        <div className="flex-1">{children}</div>
        {footer && (
          <div className={`
            mt-4 pt-4 border-t border-neutral-200
            ${padding === 'none' ? '' : ''}
          `}>
            {footer}
          </div>
        )}
      </div>
    );

    if (Component && href) {
      return <Component href={href}>{cardContent}</Component>;
    }

    return cardContent;
  }
);

Card.displayName = 'Card';

export default Card;
