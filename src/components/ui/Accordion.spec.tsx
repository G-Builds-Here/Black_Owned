'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Accordion } from './Accordion';

// Current component API notes (source of truth: Accordion.tsx):
// - items use `header`, not `title`.
// - AccordionTrigger/AccordionContent are pass-through wrappers; the styled
//   trigger is the per-item header <button> and the styled content is the
//   role="region" wrapper (id `accordion-content-<key>`) inside each item.
// - Collapsed content stays in the DOM (height/opacity animation), so
//   visibility is asserted via style + aria-expanded, not presence.

const mockItems = [
  { key: 'item1', header: 'Accordion Item 1', content: 'Content for item 1' },
  { key: 'item2', header: 'Accordion Item 2', content: 'Content for item 2' },
  { key: 'item3', header: 'Accordion Item 3', content: 'Content for item 3' },
];

const root = (container: HTMLElement) => container.firstChild as HTMLElement;
const region = (key: string) => document.getElementById(`accordion-content-${key}`) as HTMLElement;
const header = (label: RegExp) => screen.getByRole('button', { name: label });

describe('Accordion', () => {
  it('renders all accordion items', () => {
    render(<Accordion items={mockItems} />);
    expect(screen.getByText(/accordion item 1/i)).toBeInTheDocument();
    expect(screen.getByText(/accordion item 2/i)).toBeInTheDocument();
    expect(screen.getByText(/accordion item 3/i)).toBeInTheDocument();
  });

  it('keeps collapsed content in the DOM but hidden', () => {
    render(<Accordion items={mockItems} />);
    const content = region('item1');
    expect(content).toBeInTheDocument();
    expect(content).toHaveStyle({ opacity: '0' });
    expect(content).toHaveStyle({ height: '0px' });
    expect(header(/accordion item 1/i)).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows content when item is clicked', () => {
    render(<Accordion items={mockItems} />);
    fireEvent.click(header(/accordion item 1/i));
    expect(region('item1')).toHaveStyle({ opacity: '1' });
    expect(header(/accordion item 1/i)).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles content on click', () => {
    render(<Accordion items={mockItems} />);
    const h = header(/accordion item 1/i);
    fireEvent.click(h);
    expect(region('item1')).toHaveStyle({ opacity: '1' });
    fireEvent.click(h);
    expect(region('item1')).toHaveStyle({ opacity: '0' });
    expect(h).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes other items when one is opened (single mode)', () => {
    render(<Accordion items={mockItems} />);
    fireEvent.click(header(/accordion item 1/i));
    fireEvent.click(header(/accordion item 2/i));
    expect(header(/accordion item 1/i)).toHaveAttribute('aria-expanded', 'false');
    expect(header(/accordion item 2/i)).toHaveAttribute('aria-expanded', 'true');
  });

  it('allows multiple items open when allowMultiple is true', () => {
    render(<Accordion items={mockItems} allowMultiple />);
    fireEvent.click(header(/accordion item 1/i));
    fireEvent.click(header(/accordion item 2/i));
    expect(header(/accordion item 1/i)).toHaveAttribute('aria-expanded', 'true');
    expect(header(/accordion item 2/i)).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onExpansionChange with the expanded keys', () => {
    const handleChange = jest.fn();
    render(<Accordion items={mockItems} onExpansionChange={handleChange} />);
    fireEvent.click(header(/accordion item 1/i));
    expect(handleChange).toHaveBeenCalledWith(['item1']);
  });

  it('has border for accordion items', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const item = root(container).children[0] as HTMLElement;
    expect(item).toHaveClass('border-b');
    expect(item).toHaveClass('border-neutral-200');
  });

  it('has rounded corners', () => {
    const { container } = render(<Accordion items={mockItems} />);
    expect(root(container)).toHaveClass('rounded-lg');
  });

  it('has overflow hidden', () => {
    const { container } = render(<Accordion items={mockItems} />);
    expect(root(container)).toHaveClass('overflow-hidden');
  });

  it('has background color', () => {
    const { container } = render(<Accordion items={mockItems} />);
    expect(root(container)).toHaveClass('bg-white');
  });

  it('has transition animation on content', () => {
    render(<Accordion items={mockItems} />);
    const content = region('item1');
    expect(content).toHaveClass('transition-all');
    expect(content).toHaveClass('duration-200');
  });

  it('has chevron icon that rotates when expanded', () => {
    render(<Accordion items={mockItems} />);
    const h = header(/accordion item 1/i);
    const chevron = h.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(chevron).toBeInTheDocument();
    expect(chevron).not.toHaveClass('rotate-180');
    fireEvent.click(h);
    expect(chevron).toHaveClass('rotate-180');
  });

  it('applies custom className', () => {
    const { container } = render(<Accordion items={mockItems} className="custom-class" />);
    expect(root(container)).toHaveClass('custom-class');
  });

  it('separates items with bottom borders', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const items = Array.from(root(container).children) as HTMLElement[];
    expect(items[0]).toHaveClass('border-b');
    expect(items[items.length - 1]).toHaveClass('last:border-b-0');
  });
});

describe('Accordion header button', () => {
  const renderHeader = () =>
    render(<Accordion items={[{ key: 'only', header: 'Test', content: 'Body' }]} />);

  it('has cursor pointer', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Test' })).toHaveClass('cursor-pointer');
  });

  it('has flex layout with space between', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'Test' });
    expect(trigger).toHaveClass('flex');
    expect(trigger).toHaveClass('justify-between');
    expect(trigger).toHaveClass('items-center');
  });

  it('has padding', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'Test' });
    expect(trigger).toHaveClass('px-6');
    expect(trigger).toHaveClass('py-4');
  });

  it('has font-medium on the label', () => {
    renderHeader();
    expect(screen.getByText('Test')).toHaveClass('font-medium');
  });

  it('has transition styles', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Test' })).toHaveClass('transition-colors');
  });

  it('has hover styles', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Test' })).toHaveClass('hover:bg-neutral-50');
  });

  it('renders disabled items as disabled', () => {
    render(<Accordion items={[{ key: 'd', header: 'Disabled', content: 'Body', disabled: true }]} />);
    const trigger = screen.getByRole('button', { name: 'Disabled' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveClass('cursor-not-allowed');
  });
});

describe('AccordionContent', () => {
  const renderContent = () =>
    render(<Accordion items={[{ key: 'a', header: 'H', content: 'Content' }]} />);

  it('renders children', () => {
    renderContent();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('hides content when collapsed', () => {
    renderContent();
    expect(region('a')).toHaveStyle({ opacity: '0', height: '0px' });
  });

  it('has padding and overflow hidden for animation', () => {
    renderContent();
    const wrapper = region('a');
    expect(wrapper).toHaveClass('overflow-hidden');
    const inner = wrapper.querySelector('div') as HTMLElement;
    expect(inner).toHaveClass('px-6');
    expect(inner).toHaveClass('pb-4');
  });
});
