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

export const Input = ({ placeholder, value, onChange }: any) => (
  <input
    data-testid="input"
    placeholder={placeholder}
    value={value}
    onChange={onChange}
  />
);

export const Modal = ({ isOpen, onClose, title, size, children }: any) => {
  if (!isOpen) return null;
  return (
    <div data-testid="modal" role="dialog" aria-label={title}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  );
};

export const Dropdown = ({ trigger, items, position }: any) => (
  <div data-testid="dropdown" data-position={position}>
    {trigger}
    <div className="dropdown-menu">
      {items.map((item: any) => (
        <button key={item.key} onClick={item.onClick}>
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

export const Table = ({ children, className, 'aria-label': ariaLabel }: any) => (
  <table data-testid="table" className={className} aria-label={ariaLabel}>
    {children}
  </table>
);

export const TableHeader = ({ children }: any) => <thead>{children}</thead>;

export const TableBody = ({ children }: any) => <tbody>{children}</tbody>;

export const TableColumn = ({ children, className }: any) => (
  <th className={className}>{children}</th>
);

export const TableRow = ({ children, className, onClick }: any) => (
  <tr className={className} onClick={onClick}>{children}</tr>
);

export const TableCell = ({ children, className, colSpan }: any) => (
  <td className={className} colSpan={colSpan}>{children}</td>
);
