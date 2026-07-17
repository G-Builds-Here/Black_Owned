'use client';

import React, { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Loading state */
  isLoading?: boolean;
  /** Loading text to display */
  loadingText?: string;
  /** Icon to display before text */
  leftIcon?: React.ReactNode;
  /** Icon to display after text */
  rightIcon?: React.ReactNode;
  /** Full width button */
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center justify-center font-medium rounded-lg
      transition-all duration-200 ease-out
      focus:outline-none focus:ring-2 focus:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
      active:scale-[0.98]
    `;

    const variantStyles = {
      primary: `
        bg-heritage-ochre text-white
        hover:bg-heritage-terracotta
        focus:ring-heritage-ochre
        shadow-soft
      `,
      secondary: `
        bg-heritage-jade text-white
        hover:bg-heritage-forest
        focus:ring-heritage-jade
        shadow-soft
      `,
      tertiary: `
        bg-heritage-gold text-neutral-900
        hover:bg-heritage-amber
        focus:ring-heritage-gold
        shadow-soft
      `,
      ghost: `
        bg-transparent text-neutral-700
        hover:bg-neutral-100
        focus:ring-neutral-400
      `,
      danger: `
        bg-heritage-crimson text-white
        hover:bg-heritage-burgundy
        focus:ring-heritage-crimson
        shadow-soft
      `,
    };

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
      md: 'px-5 py-2.5 text-base gap-2',
      lg: 'px-7 py-3.5 text-lg gap-2.5',
    };

    const widthStyles = fullWidth ? 'w-full' : '';

    const loadingSpinner = (
      <svg
        className="animate-spin h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyles} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            {loadingSpinner}
            {loadingText || children}
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
