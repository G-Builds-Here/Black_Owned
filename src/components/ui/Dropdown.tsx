'use client';

import React, { HTMLAttributes, forwardRef, useEffect, useRef, useState, useCallback } from 'react';

export interface DropdownItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  dividerAfter?: boolean;
  onClick?: () => void;
}

export interface DropdownProps extends HTMLAttributes<HTMLDivElement> {
  /** Trigger button label */
  trigger: React.ReactNode;
  /** Extra classes for the trigger button (e.g. pill styling) */
  triggerClassName?: string;
  /** Dropdown items */
  items: DropdownItem[];
  /** Whether dropdown is open (controlled) */
  isOpen?: boolean;
  /** Open change handler */
  onOpenChange?: (open: boolean) => void;
  /** Position */
  position?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  /** Close on item click */
  closeOnItemClick?: boolean;
  /** Close on outside click */
  closeOnOutsideClick?: boolean;
  /** Min width of dropdown */
  minWidth?: string;
}

const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  (
    {
      trigger,
      triggerClassName,
      items,
      isOpen: controlledOpen,
      onOpenChange,
      position = 'bottom-start',
      closeOnItemClick = true,
      closeOnOutsideClick = true,
      minWidth = '160px',
      className = '',
      triggerClassName = '',
      ...props
    },
    ref
  ) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (controlledOpen === undefined) {
          setInternalOpen(open);
        }
        onOpenChange?.(open);
      },
      [controlledOpen, onOpenChange]
    );

    // Close on outside click
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (closeOnOutsideClick && containerRef.current && !containerRef.current.contains(e.target as Node)) {
          handleOpenChange(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, closeOnOutsideClick, handleOpenChange]);

    // Handle keyboard navigation
    useEffect(() => {
      if (!isOpen) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleOpenChange(false);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleOpenChange]);

    const getPositionClasses = () => {
      const base = 'absolute z-50 bg-white rounded-lg shadow-lg border border-neutral-200 min-w-[160px]';
      const positionClasses = {
        'bottom-start': 'top-full left-0 mt-1',
        'bottom-end': 'top-full right-0 mt-1',
        'top-start': 'bottom-full left-0 mb-1',
        'top-end': 'bottom-full right-0 mb-1',
      };
      return `${base} ${positionClasses[position]}`;
    };

    const handleItemClick = (item: DropdownItem) => {
      if (item.disabled) return;
      item.onClick?.();
      if (closeOnItemClick) {
        handleOpenChange(false);
      }
    };

    return (
      <div
        className="relative inline-block"
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
      >
        <button
          type="button"
          onClick={() => handleOpenChange(!isOpen)}
          className={`inline-flex items-center gap-1.5 ${triggerClassName ?? ''}`}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          {trigger}
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div
            ref={dropdownRef}
            className={getPositionClasses()}
            style={{ minWidth }}
            role="menu"
            {...props}
          >
            <div className="py-1">
              {items.map((item, index) => (
                <React.Fragment key={item.key}>
                  <button
                    className={`
                      w-full flex items-center gap-3 px-4 py-2.5 text-sm
                      transition-colors text-left
                      ${item.disabled
                        ? 'text-neutral-400 cursor-not-allowed'
                        : 'text-neutral-700 hover:bg-neutral-100'
                      }
                    `}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                    role="menuitem"
                  >
                    {item.icon && <span className="flex-shrink-0 w-5 h-5">{item.icon}</span>}
                    <span className="flex-1">{item.label}</span>
                  </button>
                  {item.dividerAfter && (
                    <div className="border-t border-neutral-200 my-1" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

Dropdown.displayName = 'Dropdown';

export default Dropdown;
