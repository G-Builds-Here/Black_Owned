/**
 * Table Component
 *
 * A simple responsive table for displaying tabular data.
 */

import React from 'react';

export interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export interface TableHeaderProps {
  children: React.ReactNode;
}

export interface TableColumnProps {
  children: React.ReactNode;
  className?: string;
}

export interface TableBodyProps {
  children: React.ReactNode;
}

export interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full divide-y divide-neutral-200 ${className || ''}`}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children }: TableHeaderProps) {
  return (
    <thead className="bg-neutral-50">
      {children}
    </thead>
  );
}

export function TableColumn({ children, className }: TableColumnProps) {
  return (
    <th
      className={`px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider ${className || ''}`}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: TableBodyProps) {
  return (
    <tbody className="bg-white divide-y divide-neutral-200">
      {children}
    </tbody>
  );
}

export function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr
      className={`hover:bg-neutral-50 ${className || ''}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className, align = 'left' }: TableCellProps) {
  return (
    <td
      className={`px-6 py-4 whitespace-nowrap text-sm text-neutral-900 ${
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
      } ${className || ''}`}
    >
      {children}
    </td>
  );
}
