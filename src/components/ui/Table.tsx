import React from 'react';

export interface TableProps {
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

export interface TableHeaderProps {
  children: React.ReactNode;
}

export interface TableBodyProps {
  children: React.ReactNode;
}

export interface TableColumnProps {
  children: React.ReactNode;
  className?: string;
}

export interface TableRowProps {
  children: React.ReactNode;
  className?: string;
}

export interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}

export const TableHeader: React.FC<TableHeaderProps> = ({ children }) => (
  <thead className="bg-neutral-100">{children}</thead>
);

export const TableBody: React.FC<TableBodyProps> = ({ children }) => (
  <tbody>{children}</tbody>
);

export const TableColumn: React.FC<TableColumnProps> = ({ children, className }) => (
  <th className={`px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider ${className || ''}`}>
    {children}
  </th>
);

export const TableRow: React.FC<TableRowProps> = ({ children, className }) => (
  <tr className={`border-b border-neutral-200 hover:bg-neutral-50 ${className || ''}`}>
    {children}
  </tr>
);

export const TableCell: React.FC<TableCellProps> = ({ children, className, colSpan }) => (
  <td className={`px-6 py-4 whitespace-nowrap text-sm text-neutral-800 ${className || ''}`} colSpan={colSpan}>
    {children}
  </td>
);

export const Table: React.FC<TableProps> = ({ children, className, 'aria-label': ariaLabel }) => (
  <div className="overflow-x-auto">
    <table className={`min-w-full divide-y divide-neutral-200 ${className || ''}`} aria-label={ariaLabel}>
      {children}
    </table>
  </div>
);
