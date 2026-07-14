'use client';

import React, { HTMLAttributes, forwardRef, useState, useCallback, createContext, useContext } from 'react';

export interface Tab {
  key: string;
  label: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  /** Tab items */
  tabs: Tab[];
  /** Initially selected tab key */
  defaultSelectedKey?: string;
  /** Selected tab key (controlled) */
  selectedKey?: string;
  /** Selection change handler */
  onSelectionChange?: (key: string) => void;
  /** Tab variant */
  variant?: 'underlined' | 'pills' | 'segmented';
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Full width tabs */
  fullWidth?: boolean;
}

interface TabsContextType {
  selectedKey: string;
  handleSelect: (key: string) => void;
  tabs: Tab[];
  variant: TabsProps['variant'];
  size: TabsProps['size'];
}

const TabsContext = createContext<TabsContextType | null>(null);

const variantStyles = {
  underlined: {
    base: 'border-b border-neutral-200',
    tab: 'border-b-2 -mb-px font-medium',
    selected: 'border-heritage-ochre text-heritage-ochre',
    unselected: 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300',
  },
  pills: {
    base: 'bg-neutral-100 p-1 rounded-lg inline-flex',
    tab: 'rounded-md px-4 py-2 text-sm font-medium transition-all',
    selected: 'bg-white text-neutral-900 shadow-sm',
    unselected: 'text-neutral-600 hover:text-neutral-900',
  },
  segmented: {
    base: 'bg-neutral-100 p-1 rounded-lg inline-flex w-full',
    tab: 'rounded-md py-2 text-sm font-medium transition-all flex-1 justify-center',
    selected: 'bg-white text-neutral-900 shadow-sm',
    unselected: 'text-neutral-600 hover:text-neutral-900',
  },
};

const sizeStyles = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      tabs,
      defaultSelectedKey,
      selectedKey: controlledSelectedKey,
      onSelectionChange,
      variant = 'underlined',
      size = 'md',
      fullWidth = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const [internalSelectedKey, setInternalSelectedKey] = useState(
      defaultSelectedKey || tabs[0]?.key || ''
    );

    const selectedKey = controlledSelectedKey !== undefined ? controlledSelectedKey : internalSelectedKey;

    const handleSelect = useCallback(
      (key: string) => {
        const tab = tabs.find((t) => t.key === key);
        if (tab?.disabled) return;
        if (controlledSelectedKey === undefined) {
          setInternalSelectedKey(key);
        }
        onSelectionChange?.(key);
      },
      [tabs, controlledSelectedKey, onSelectionChange]
    );

    const contextValue: TabsContextType = {
      selectedKey,
      handleSelect,
      tabs,
      variant,
      size,
    };

    const isSegmented = variant === 'segmented';

    return (
      <TabsContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={`${variantStyles[variant].base} ${fullWidth && isSegmented ? 'w-full' : ''} ${className}`}
          role="tablist"
          {...props}
        >
          {tabs.map((tab) => (
            <TabButton key={tab.key} tab={tab} />
          ))}
        </div>
        <div className="mt-4">{children}</div>
      </TabsContext.Provider>
    );
  }
);

Tabs.displayName = 'Tabs';

const TabButton = forwardRef<HTMLButtonElement, { tab: Tab }>(
  ({ tab }, ref) => {
    const { selectedKey, handleSelect, variant = 'underlined', size = 'md' } = useContext(TabsContext)!;
    const isSelected = selectedKey === tab.key;

    return (
      <button
        ref={ref}
        role="tab"
        aria-selected={isSelected}
        aria-disabled={tab.disabled}
        disabled={tab.disabled}
        onClick={() => handleSelect(tab.key)}
        className={`
          ${variantStyles[variant]?.tab || variantStyles.underlined.tab}
          ${variantStyles[variant]?.[isSelected ? 'selected' : 'unselected'] || variantStyles.underlined[isSelected ? 'selected' : 'unselected']}
          ${sizeStyles[size] || sizeStyles.md}
          ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${variant === 'segmented' ? 'flex-1' : ''}
          focus:outline-none focus:ring-2 focus:ring-heritage-ochre focus:ring-offset-2
          transition-all
        `}
      >
        <span className="flex items-center gap-2">
          {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
          {tab.label}
        </span>
      </button>
    );
  }
);

TabButton.displayName = 'TabButton';

interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Panel key matching a tab key */
  value: string;
}

const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(
  ({ value, children, className = '', ...props }, ref) => {
    const { selectedKey } = useContext(TabsContext)!;

    if (selectedKey !== value) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        aria-labelledby={value}
        className={className}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TabPanel.displayName = 'TabPanel';

interface TabContentProps {
  children: React.ReactNode;
}

const TabContent = ({ children }: TabContentProps) => {
  return <>{children}</>;
};

export { Tabs, TabPanel, TabContent };
