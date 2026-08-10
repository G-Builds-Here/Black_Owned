export const Card = ({ children, variant, padding }: any) => (
  <div data-testid="card" data-variant={variant} data-padding={padding}>
    {children}
  </div>
);

export const Badge = ({ children, variant, size }: any) => (
  <span data-testid="badge" data-variant={variant} data-size={size}>
    {children}
  </span>
);

export const Button = ({ children, variant, size, onClick, disabled, 'aria-label': ariaLabel }: any) => (
  <button
    data-testid="button"
    data-variant={variant}
    data-size={size}
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
  >
    {children}
  </button>
);

export const Tabs = ({ tabs, selectedKey, onSelectionChange }: any) => (
  <div data-testid="tabs" data-selected={selectedKey}>
    {tabs.map((tab: any) => (
      <button key={tab.key} onClick={() => onSelectionChange(tab.key)}>
        {tab.label}
      </button>
    ))}
  </div>
);

export const TabPanel = ({ value, children }: any) => <div data-testid="tab-panel">{children}</div>;
