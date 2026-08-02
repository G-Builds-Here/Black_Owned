/**
 * Table Component Tests
 */

import { render, screen } from '@testing-library/react';
import { Table, TableHeader, TableColumn, TableRow, TableCell } from './Table';

describe('Table', () => {
  it('renders the table with aria-label', () => {
    render(
      <Table aria-label="Test table">
        <tbody>
          <tr>
            <td>Test</td>
          </tr>
        </tbody>
      </Table>
    );
    const table = screen.getByRole('table', { name: 'Test table' });
    expect(table).toBeInTheDocument();
  });

  it('renders table header with columns', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableColumn>Column 1</TableColumn>
            <TableColumn>Column 2</TableColumn>
          </TableRow>
        </TableHeader>
        <tbody>
          <tr>
            <TableCell>Cell 1</TableCell>
            <TableCell>Cell 2</TableCell>
          </tr>
        </tbody>
      </Table>
    );
    expect(screen.getByText('Column 1')).toBeInTheDocument();
    expect(screen.getByText('Column 2')).toBeInTheDocument();
    expect(screen.getByText('Cell 1')).toBeInTheDocument();
    expect(screen.getByText('Cell 2')).toBeInTheDocument();
  });

  it('renders table row with cells', () => {
    render(
      <Table>
        <tbody>
          <TableRow>
            <TableCell>Row 1 Cell 1</TableCell>
            <TableCell>Row 1 Cell 2</TableCell>
          </TableRow>
        </tbody>
      </Table>
    );
    expect(screen.getByText('Row 1 Cell 1')).toBeInTheDocument();
    expect(screen.getByText('Row 1 Cell 2')).toBeInTheDocument();
  });

  it('renders table cell with colSpan', () => {
    render(
      <Table>
        <tbody>
          <TableRow>
            <TableCell colSpan={2}>Spanning Cell</TableCell>
          </TableRow>
        </tbody>
      </Table>
    );
    const cell = screen.getByText('Spanning Cell');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveAttribute('colspan', '2');
  });
});
