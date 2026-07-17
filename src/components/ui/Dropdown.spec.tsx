'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dropdown from './Dropdown';

describe('Dropdown', () => {
  it('renders trigger element', () => {
    render(<Dropdown trigger="Click me" items={[]} />);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('renders trigger with custom element', () => {
    render(
      <Dropdown
        trigger={<span data-testid="custom-trigger">Custom Trigger</span>}
        items={[]}
      />
    );
    expect(screen.getByTestId('custom-trigger')).toBeInTheDocument();
  });

  it('renders dropdown items when opened', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
      { key: '2', label: 'Item 2', onClick: jest.fn() },
    ];
    render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.getByText(/item 1/i)).toBeInTheDocument();
    expect(screen.getByText(/item 2/i)).toBeInTheDocument();
  });

  it('calls onClick when item is clicked', () => {
    const handleClick = jest.fn();
    const items = [
      { key: '1', label: 'Item 1', onClick: handleClick },
    ];
    render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    fireEvent.click(screen.getByText(/item 1/i));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('closes dropdown when item is clicked', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
    ];
    render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.getByText(/item 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/item 1/i));
    expect(screen.queryByText(/item 1/i)).not.toBeInTheDocument();
  });

  it('toggles dropdown on trigger click', () => {
    const items = [{ key: '1', label: 'Item 1', onClick: jest.fn() }];
    render(<Dropdown trigger="Open" items={items} />);
    const trigger = screen.getByRole('button', { name: /open/i });
    fireEvent.click(trigger);
    expect(screen.getByText(/item 1/i)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByText(/item 1/i)).not.toBeInTheDocument();
  });

  it('applies default position (bottom-start)', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('absolute');
  });

  it('applies bottom-end position', () => {
    const { container } = render(
      <Dropdown
        trigger="Open"
        items={[{ key: '1', label: 'Item', onClick: jest.fn() }]}
        position="bottom-end"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('right-0');
  });

  it('applies top-start position', () => {
    const { container } = render(
      <Dropdown
        trigger="Open"
        items={[{ key: '1', label: 'Item', onClick: jest.fn() }]}
        position="top-start"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('bottom-full');
  });

  it('applies top-end position', () => {
    const { container } = render(
      <Dropdown
        trigger="Open"
        items={[{ key: '1', label: 'Item', onClick: jest.fn() }]}
        position="top-end"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('bottom-full');
    expect(dropdown).toHaveClass('right-0');
  });

  it('has shadow styling', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('shadow-lg');
  });

  it('has rounded border', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('rounded-lg');
  });

  it('has z-index for stacking', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('z-50');
  });

  it('has white background', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('bg-white');
  });

  it('has border', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('border');
    expect(dropdown).toHaveClass('border-neutral-200');
  });

  it('renders divider between items when showDivider is true', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
      { key: '2', label: 'Item 2', onClick: jest.fn() },
    ];
    const { container } = render(
      <Dropdown trigger="Open" items={items} showDivider />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const divider = container.querySelector('[data-testid="dropdown-divider"]');
    expect(divider).toBeInTheDocument();
  });

  it('does not render divider when showDivider is false', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
      { key: '2', label: 'Item 2', onClick: jest.fn() },
    ];
    const { container } = render(
      <Dropdown trigger="Open" items={items} showDivider={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const divider = container.querySelector('[data-testid="dropdown-divider"]');
    expect(divider).not.toBeInTheDocument();
  });

  it('has padding', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('py-1');
  });

  it('has min width', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={[{ key: '1', label: 'Item', onClick: jest.fn() }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = container.querySelector('[data-testid="dropdown-menu"]');
    expect(dropdown).toHaveClass('min-w-[150px]');
  });

  it('item has hover styles', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
    ];
    const { container } = render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const item = container.querySelector('[data-testid="dropdown-item"]');
    expect(item).toHaveClass('hover:bg-neutral-100');
    expect(item).toHaveClass('transition-colors');
  });

  it('item has padding', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
    ];
    const { container } = render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const item = container.querySelector('[data-testid="dropdown-item"]');
    expect(item).toHaveClass('px-4');
    expect(item).toHaveClass('py-2');
  });

  it('item has cursor pointer', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
    ];
    const { container } = render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const item = container.querySelector('[data-testid="dropdown-item"]');
    expect(item).toHaveClass('cursor-pointer');
  });
});
