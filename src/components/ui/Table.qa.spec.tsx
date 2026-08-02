/**
 * Table Component - QA Validation Tests
 * Validates Table component for AC1: List pending businesses for review
 */

import { render, screen } from '@testing-library/react';
import { Table, TableHeader, TableColumn, TableRow, TableCell, TableBody } from './Table';

describe('Table - QA Validation', () => {
  describe('Table accessibility and structure', () => {
    it('renders table with aria-label for accessibility', () => {
      render(
        <Table aria-label="Test table">
          <TableBody>
            <TableRow>
              <TableCell>Test</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const table = screen.getByRole('table', { name: 'Test table' });
      expect(table).toBeInTheDocument();
    });

    it('renders table with overflow wrapper for responsive design', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Test</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const wrapper = screen.getByRole('table').parentElement;
      expect(wrapper).toHaveClass('overflow-x-auto');
    });

    it('applies custom className when provided', () => {
      render(
        <Table className="custom-table-class">
          <TableBody>
            <TableRow>
              <TableCell>Test</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      expect(screen.getByRole('table')).toHaveClass('custom-table-class');
    });
  });

  describe('TableHeader component', () => {
    it('renders table header element', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableColumn>Header</TableColumn>
            </TableRow>
          </TableHeader>
        </Table>
      );
      expect(screen.getByRole('table').querySelector('thead')).toBeInTheDocument();
    });

    it('applies neutral background to header', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableColumn>Header</TableColumn>
            </TableRow>
          </TableHeader>
        </Table>
      );
      const thead = screen.getByRole('table').querySelector('thead');
      expect(thead).toHaveClass('bg-neutral-100');
    });
  });

  describe('TableColumn component', () => {
    it('renders table header cell', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableColumn>Column Name</TableColumn>
            </TableRow>
          </TableHeader>
        </Table>
      );
      const th = screen.getByRole('table').querySelector('th');
      expect(th).toBeInTheDocument();
      expect(th).toHaveTextContent('Column Name');
    });

    it('applies proper header styling', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableColumn>Column</TableColumn>
            </TableRow>
          </TableHeader>
        </Table>
      );
      const th = screen.getByRole('table').querySelector('th');
      expect(th).toHaveClass('px-6', 'py-3', 'text-left', 'text-xs', 'font-medium', 'text-neutral-500', 'uppercase', 'tracking-wider');
    });

    it('applies custom className when provided', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableColumn className="custom-header-class">Column</TableColumn>
            </TableRow>
          </TableHeader>
        </Table>
      );
      const th = screen.getByRole('table').querySelector('th');
      expect(th).toHaveClass('custom-header-class');
    });
  });

  describe('TableRow component', () => {
    it('renders table row element', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Row Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const tr = screen.getByRole('table').querySelector('tr');
      expect(tr).toBeInTheDocument();
    });

    it('applies border and hover styling', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Row Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const tr = screen.getByRole('table').querySelector('tr');
      expect(tr).toHaveClass('border-b', 'border-neutral-200', 'hover:bg-neutral-50');
    });

    it('applies custom className when provided', () => {
      render(
        <Table>
          <TableBody>
            <TableRow className="custom-row-class">
              <TableCell>Row Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const tr = screen.getByRole('table').querySelector('tr');
      expect(tr).toHaveClass('custom-row-class');
    });
  });

  describe('TableCell component', () => {
    it('renders table data cell', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Cell Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const td = screen.getByRole('table').querySelector('td');
      expect(td).toBeInTheDocument();
      expect(td).toHaveTextContent('Cell Content');
    });

    it('applies proper cell styling', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const td = screen.getByRole('table').querySelector('td');
      expect(td).toHaveClass('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-neutral-800');
    });

    it('applies custom className when provided', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="custom-cell-class">Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const td = screen.getByRole('table').querySelector('td');
      expect(td).toHaveClass('custom-cell-class');
    });

    it('applies colSpan attribute when provided', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell colSpan={3}>Spanning Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      const td = screen.getByRole('table').querySelector('td');
      expect(td).toHaveAttribute('colspan', '3');
    });
  });

  describe('TableBody component', () => {
    it('renders table body element', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Body Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
      expect(screen.getByRole('table').querySelector('tbody')).toBeInTheDocument();
    });
  });

  describe('Complete table structure', () => {
    it('renders complete table with header and body', () => {
      render(
        <Table aria-label="Complete table">
          <TableHeader>
            <TableRow>
              <TableColumn>Column 1</TableColumn>
              <TableColumn>Column 2</TableColumn>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Row 1, Cell 1</TableCell>
              <TableCell>Row 1, Cell 2</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Row 2, Cell 1</TableCell>
              <TableCell>Row 2, Cell 2</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      const table = screen.getByRole('table', { name: 'Complete table' });
      expect(table).toBeInTheDocument();
      expect(screen.getByText('Column 1')).toBeInTheDocument();
      expect(screen.getByText('Column 2')).toBeInTheDocument();
      expect(screen.getByText('Row 1, Cell 1')).toBeInTheDocument();
      expect(screen.getByText('Row 2, Cell 2')).toBeInTheDocument();
    });

    it('renders multiple rows correctly', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableColumn>Header</TableColumn>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Row 1</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Row 2</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Row 3</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      const rows = screen.getAllByRole('row');
      expect(rows.length).toBe(4); // 1 header row + 3 data rows
    });

    it('renders spanning cell in table body', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6}>Empty state message</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      const td = screen.getByText('Empty state message');
      expect(td).toHaveAttribute('colspan', '6');
    });
  });
});
