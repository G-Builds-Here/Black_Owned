'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Accordion, AccordionTrigger, AccordionContent } from './Accordion';

describe('Accordion', () => {
  const mockItems = [
    {
      key: 'item1',
      title: 'Accordion Item 1',
      content: 'Content for item 1',
    },
    {
      key: 'item2',
      title: 'Accordion Item 2',
      content: 'Content for item 2',
    },
    {
      key: 'item3',
      title: 'Accordion Item 3',
      content: 'Content for item 3',
    },
  ];

  it('renders all accordion items', () => {
    render(<Accordion items={mockItems} />);
    expect(screen.getByText(/accordion item 1/i)).toBeInTheDocument();
    expect(screen.getByText(/accordion item 2/i)).toBeInTheDocument();
    expect(screen.getByText(/accordion item 3/i)).toBeInTheDocument();
  });

  it('does not show content by default', () => {
    render(<Accordion items={mockItems} />);
    expect(screen.queryByText(/content for item 1/i)).not.toBeInTheDocument();
  });

  it('shows content when item is clicked', () => {
    render(<Accordion items={mockItems} />);
    fireEvent.click(screen.getByText(/accordion item 1/i));
    expect(screen.getByText(/content for item 1/i)).toBeInTheDocument();
  });

  it('toggles content on click', () => {
    render(<Accordion items={mockItems} />);
    fireEvent.click(screen.getByText(/accordion item 1/i));
    expect(screen.getByText(/content for item 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/accordion item 1/i));
    expect(screen.queryByText(/content for item 1/i)).not.toBeInTheDocument();
  });

  it('closes other items when one is opened (single mode)', () => {
    render(<Accordion items={mockItems} />);
    fireEvent.click(screen.getByText(/accordion item 1/i));
    expect(screen.getByText(/content for item 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/accordion item 2/i));
    expect(screen.getByText(/content for item 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/content for item 1/i)).not.toBeInTheDocument();
  });

  it('allows multiple items open when allowMultiple is true', () => {
    render(<Accordion items={mockItems} allowMultiple />);
    fireEvent.click(screen.getByText(/accordion item 1/i));
    fireEvent.click(screen.getByText(/accordion item 2/i));
    expect(screen.getByText(/content for item 1/i)).toBeInTheDocument();
    expect(screen.getByText(/content for item 2/i)).toBeInTheDocument();
  });

  it('has border for accordion items', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const item = container.querySelector('[data-testid="accordion-item"]');
    expect(item).toHaveClass('border');
    expect(item).toHaveClass('border-neutral-200');
  });

  it('has rounded corners', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const item = container.querySelector('[data-testid="accordion-item"]');
    expect(item).toHaveClass('rounded-lg');
  });

  it('has overflow hidden', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const item = container.querySelector('[data-testid="accordion-item"]');
    expect(item).toHaveClass('overflow-hidden');
  });

  it('has background color', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const item = container.querySelector('[data-testid="accordion-item"]');
    expect(item).toHaveClass('bg-white');
  });

  it('has transition animation', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const content = container.querySelector('[data-testid="accordion-content"]');
    expect(content).toHaveClass('transition-all');
    expect(content).toHaveClass('duration-300');
  });

  it('has chevron icon that rotates', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const chevron = container.querySelector('[data-testid="accordion-chevron"]');
    expect(chevron).toBeInTheDocument();
  });

  it('Applies custom className', () => {
    const { container } = render(<Accordion items={mockItems} className="custom-class" />);
    const accordion = container.querySelector('[data-testid="accordion"]');
    expect(accordion).toHaveClass('custom-class');
  });

  it('has gap between items', () => {
    const { container } = render(<Accordion items={mockItems} />);
    const accordion = container.querySelector('[data-testid="accordion"]');
    expect(accordion).toHaveClass('gap-2');
  });
});

describe('AccordionTrigger', () => {
  it('renders title', () => {
    render(<AccordionTrigger title="Test Title" isOpen={false} onToggle={jest.fn()} />);
    expect(screen.getByText(/test title/i)).toBeInTheDocument();
  });

  it('has cursor pointer', () => {
    const { container } = render(<AccordionTrigger title="Test" isOpen={false} onToggle={jest.fn()} />);
    const trigger = container.querySelector('[data-testid="accordion-trigger"]');
    expect(trigger).toHaveClass('cursor-pointer');
  });

  it('has flex layout with space between', () => {
    const { container } = render(<AccordionTrigger title="Test" isOpen={false} onToggle={jest.fn()} />);
    const trigger = container.querySelector('[data-testid="accordion-trigger"]');
    expect(trigger).toHaveClass('flex');
    expect(trigger).toHaveClass('justify-between');
    expect(trigger).toHaveClass('items-center');
  });

  it('has padding', () => {
    const { container } = render(<AccordionTrigger title="Test" isOpen={false} onToggle={jest.fn()} />);
    const trigger = container.querySelector('[data-testid="accordion-trigger"]');
    expect(trigger).toHaveClass('p-4');
  });

  it('has font-medium', () => {
    const { container } = render(<AccordionTrigger title="Test" isOpen={false} onToggle={jest.fn()} />);
    const trigger = container.querySelector('[data-testid="accordion-trigger"]');
    expect(trigger).toHaveClass('font-medium');
  });

  it('calls onToggle when clicked', () => {
    const handleToggle = jest.fn();
    render(<AccordionTrigger title="Test" isOpen={false} onToggle={handleToggle} />);
    fireEvent.click(screen.getByText(/test/i));
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('has transition styles', () => {
    const { container } = render(<AccordionTrigger title="Test" isOpen={false} onToggle={jest.fn()} />);
    const trigger = container.querySelector('[data-testid="accordion-trigger"]');
    expect(trigger).toHaveClass('transition-colors');
    expect(trigger).toHaveClass('duration-200');
  });

  it('has hover styles', () => {
    const { container } = render(<AccordionTrigger title="Test" isOpen={false} onToggle={jest.fn()} />);
    const trigger = container.querySelector('[data-testid="accordion-trigger"]');
    expect(trigger).toHaveClass('hover:bg-neutral-50');
  });
});

describe('AccordionContent', () => {
  it('renders children', () => {
    render(
      <AccordionContent isOpen={true}>
        <div data-testid="content">Accordion Content</div>
      </AccordionContent>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <AccordionContent isOpen={false}>
        <div data-testid="content">Accordion Content</div>
      </AccordionContent>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('has padding', () => {
    const { container } = render(
      <AccordionContent isOpen={true}>
        <div>Content</div>
      </AccordionContent>
    );
    const content = container.querySelector('[data-testid="accordion-content-inner"]');
    expect(content).toHaveClass('p-4');
  });

  it('has text color', () => {
    const { container } = render(
      <AccordionContent isOpen={true}>
        <div>Content</div>
      </AccordionContent>
    );
    const content = container.querySelector('[data-testid="accordion-content-inner"]');
    expect(content).toHaveClass('text-neutral-600');
  });

  it('has overflow hidden for animation', () => {
    const { container } = render(
      <AccordionContent isOpen={true}>
        <div>Content</div>
      </AccordionContent>
    );
    const wrapper = container.querySelector('[data-testid="accordion-content"]');
    expect(wrapper).toHaveClass('overflow-hidden');
  });
});
