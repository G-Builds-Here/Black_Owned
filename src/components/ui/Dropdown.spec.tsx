'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dropdown from './Dropdown';

// The dropdown menu carries role="menu" and items role="menuitem" (no testids
// exist on the component), so structural queries use those roles.
const menu = (container: HTMLElement) => container.querySelector('[role="menu"]') as HTMLElement;
const firstItem = (container: HTMLElement) =>
  container.querySelector('[role="menuitem"]') as HTMLElement;
const singleItem = [{ key: '1', label: 'Item', onClick: jest.fn() }];

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
    const items = [{ key: '1', label: 'Item 1', onClick: handleClick }];
    render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    fireEvent.click(screen.getByText(/item 1/i));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('closes dropdown when item is clicked', () => {
    const items = [{ key: '1', label: 'Item 1', onClick: jest.fn() }];
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
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = menu(container);
    expect(dropdown).toHaveClass('absolute');
    expect(dropdown).toHaveClass('top-full');
    expect(dropdown).toHaveClass('left-0');
  });

  it('applies bottom-end position', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={singleItem} position="bottom-end" />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = menu(container);
    expect(dropdown).toHaveClass('top-full');
    expect(dropdown).toHaveClass('right-0');
  });

  it('applies top-start position', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={singleItem} position="top-start" />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = menu(container);
    expect(dropdown).toHaveClass('bottom-full');
    expect(dropdown).toHaveClass('left-0');
  });

  it('applies top-end position', () => {
    const { container } = render(
      <Dropdown trigger="Open" items={singleItem} position="top-end" />
    );
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = menu(container);
    expect(dropdown).toHaveClass('bottom-full');
    expect(dropdown).toHaveClass('right-0');
  });

  it('has shadow styling', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(menu(container)).toHaveClass('shadow-lg');
  });

  it('has rounded border', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(menu(container)).toHaveClass('rounded-lg');
  });

  it('has z-index for stacking', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(menu(container)).toHaveClass('z-50');
  });

  it('has white background', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(menu(container)).toHaveClass('bg-white');
  });

  it('has border', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(menu(container)).toHaveClass('border');
    expect(menu(container)).toHaveClass('border-neutral-200');
  });

  it('renders divider after an item when dividerAfter is true', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn(), dividerAfter: true },
      { key: '2', label: 'Item 2', onClick: jest.fn() },
    ];
    const { container } = render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const divider = container.querySelector('.border-t');
    expect(divider).toBeInTheDocument();
    expect(divider).toHaveClass('my-1');
  });

  it('does not render divider when dividerAfter is not set', () => {
    const items = [
      { key: '1', label: 'Item 1', onClick: jest.fn() },
      { key: '2', label: 'Item 2', onClick: jest.fn() },
    ];
    const { container } = render(<Dropdown trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(container.querySelector('.border-t')).not.toBeInTheDocument();
  });

  it('has padding', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    // The items wrapper (inside the menu) carries the py-1 padding.
    expect(container.querySelector('.py-1')).toBeInTheDocument();
  });

  it('has min width', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const dropdown = menu(container);
    expect(dropdown).toHaveClass('min-w-[160px]');
    expect(dropdown).toHaveStyle({ minWidth: '160px' });
  });

  it('item has hover styles', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const item = firstItem(container);
    expect(item).toHaveClass('hover:bg-neutral-100');
    expect(item).toHaveClass('transition-colors');
  });

  it('item has padding', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const item = firstItem(container);
    expect(item).toHaveClass('px-4');
    expect(item).toHaveClass('py-2.5');
  });

  it('item is a native button (pointer cursor)', () => {
    const { container } = render(<Dropdown trigger="Open" items={singleItem} />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    const item = firstItem(container);
    // Items are <button role="menuitem">, so the pointer cursor is native
    // (the component no longer applies a cursor-pointer class).
    expect(item.tagName).toBe('BUTTON');
    expect(item).toHaveAttribute('role', 'menuitem');
  });
});
