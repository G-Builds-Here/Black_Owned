'use client';

import React, { HTMLAttributes, forwardRef, useState, useCallback, createContext, useContext } from 'react';

export interface AccordionItem {
  key: string;
  header: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface AccordionProps extends HTMLAttributes<HTMLDivElement> {
  /** Accordion items */
  items: AccordionItem[];
  /** Initially expanded item keys */
  defaultExpandedKeys?: string[];
  /** Expanded item keys (controlled) */
  expandedKeys?: string[];
  /** Expansion change handler */
  onExpansionChange?: (keys: string[]) => void;
  /** Allow multiple items expanded */
  allowMultiple?: boolean;
  /** Variant */
  variant?: 'default' | 'bordered' | 'flush';
}

interface AccordionContextType {
  expandedKeys: string[];
  handleToggle: (key: string) => void;
  allowMultiple: boolean;
  variant: AccordionProps['variant'];
}

const AccordionContext = createContext<AccordionContextType | null>(null);

const variantStyles = {
  default: {
    base: 'bg-white rounded-lg border border-neutral-200 overflow-hidden',
    item: 'border-b border-neutral-200 last:border-b-0',
    header: 'px-6 py-4',
    content: 'px-6 pb-4',
  },
  bordered: {
    base: 'bg-white rounded-lg overflow-hidden border border-neutral-200',
    item: 'border-b border-neutral-200 last:border-b-0',
    header: 'px-6 py-4',
    content: 'px-6 pb-4',
  },
  flush: {
    base: '',
    item: 'border-b border-neutral-200 last:border-b-0',
    header: 'px-6 py-4',
    content: 'px-6 pb-4',
  },
};

const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      items,
      defaultExpandedKeys = [],
      expandedKeys: controlledExpandedKeys,
      onExpansionChange,
      allowMultiple = false,
      variant = 'default',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const [internalExpandedKeys, setInternalExpandedKeys] = useState(defaultExpandedKeys);

    const expandedKeys = controlledExpandedKeys !== undefined ? controlledExpandedKeys : internalExpandedKeys;

    const handleToggle = useCallback(
      (key: string) => {
        const isExpanded = expandedKeys.includes(key);
        let newKeys: string[];

        if (isExpanded) {
          // Collapse this item
          newKeys = expandedKeys.filter((k) => k !== key);
        } else {
          if (allowMultiple) {
            // Expand this item, keep others
            newKeys = [...expandedKeys, key];
          } else {
            // Expand only this item
            newKeys = [key];
          }
        }

        if (controlledExpandedKeys === undefined) {
          setInternalExpandedKeys(newKeys);
        }
        onExpansionChange?.(newKeys);
      },
      [expandedKeys, allowMultiple, controlledExpandedKeys, onExpansionChange]
    );

    const contextValue: AccordionContextType = {
      expandedKeys,
      handleToggle,
      allowMultiple,
      variant,
    };

    return (
      <AccordionContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={`${variantStyles[variant].base} ${className}`}
          {...props}
        >
          {items.map((item) => (
            <AccordionItemComponent key={item.key} item={item} />
          ))}
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);

Accordion.displayName = 'Accordion';

interface AccordionItemComponentProps {
  item: AccordionItem;
}

const AccordionItemComponent = forwardRef<HTMLDivElement, AccordionItemComponentProps>(
  ({ item }, ref) => {
    const { expandedKeys, handleToggle, variant = 'default' } = useContext(AccordionContext)!;
    const [isAnimating, setIsAnimating] = useState(false);
    const contentRef = React.useRef<HTMLDivElement>(null);

    const isExpanded = expandedKeys.includes(item.key);

    const handleHeaderClick = () => {
      if (item.disabled) return;
      handleToggle(item.key);
    };

    const contentHeight = isExpanded && contentRef.current
      ? `${contentRef.current.scrollHeight}px`
      : '0px';

    return (
      <div
        ref={ref}
        className={`${variantStyles[variant].item} ${item.disabled ? 'opacity-50' : ''}`}
      >
        <button
          type="button"
          onClick={handleHeaderClick}
          disabled={item.disabled}
          className={`
            ${variantStyles[variant].header}
            w-full flex items-center justify-between
            text-left cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-heritage-ochre focus:ring-inset
            transition-colors
            ${item.disabled ? 'cursor-not-allowed' : 'hover:bg-neutral-50'}
          `}
          aria-expanded={isExpanded}
          aria-controls={`accordion-content-${item.key}`}
        >
          <span className="flex items-center gap-3 flex-1">
            {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
            <span className="font-medium text-neutral-900">{item.header}</span>
          </span>
          <span
            className={`
              flex-shrink-0 w-6 h-6 flex items-center justify-center
              transition-transform duration-200
              ${isExpanded ? 'rotate-180' : ''}
            `}
            aria-hidden="true"
          >
            <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        <div
          id={`accordion-content-${item.key}`}
          ref={contentRef}
          className="overflow-hidden transition-all duration-200 ease-in-out"
          style={{
            height: contentHeight,
            opacity: isExpanded ? 1 : 0,
          }}
          role="region"
          aria-labelledby={`accordion-header-${item.key}`}
        >
          <div className={variantStyles[variant].content}>
            {item.content}
          </div>
        </div>
      </div>
    );
  }
);

AccordionItemComponent.displayName = 'AccordionItem';

interface AccordionTriggerProps {
  children: React.ReactNode;
}

const AccordionTrigger = ({ children }: AccordionTriggerProps) => {
  return <>{children}</>;
};

interface AccordionContentProps {
  children: React.ReactNode;
}

const AccordionContent = ({ children }: AccordionContentProps) => {
  return <>{children}</>;
};

export { Accordion, AccordionTrigger, AccordionContent };
