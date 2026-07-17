'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import Card from './Card';

describe('Card', () => {
  it('renders children correctly', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText(/card content/i)).toBeInTheDocument();
  });

  it('applies default variant (elevated)', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('bg-white');
    expect(container.firstChild).toHaveClass('shadow-soft');
    expect(container.firstChild).toHaveClass('border');
  });

  it('applies elevated variant styles', () => {
    const { container } = render(<Card variant="elevated">Test</Card>);
    expect(container.firstChild).toHaveClass('bg-white');
    expect(container.firstChild).toHaveClass('shadow-soft');
    expect(container.firstChild).toHaveClass('hover:shadow-medium');
  });

  it('applies outlined variant styles', () => {
    const { container } = render(<Card variant="outlined">Test</Card>);
    expect(container.firstChild).toHaveClass('border-2');
    expect(container.firstChild).toHaveClass('border-neutral-200');
    expect(container.firstChild).toHaveClass('hover:border-heritage-ochre');
  });

  it('applies filled variant styles', () => {
    const { container } = render(<Card variant="filled">Test</Card>);
    expect(container.firstChild).toHaveClass('bg-neutral-50');
    expect(container.firstChild).toHaveClass('border');
  });

  it('applies default padding (md)', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('p-6');
  });

  it('applies no padding when padding is none', () => {
    const { container } = render(<Card padding="none">Test</Card>);
    expect(container.firstChild).not.toHaveClass('p-4');
    expect(container.firstChild).not.toHaveClass('p-6');
    expect(container.firstChild).not.toHaveClass('p-8');
  });

  it('applies small padding', () => {
    const { container } = render(<Card padding="sm">Test</Card>);
    expect(container.firstChild).toHaveClass('p-4');
  });

  it('applies medium padding', () => {
    const { container } = render(<Card padding="md">Test</Card>);
    expect(container.firstChild).toHaveClass('p-6');
  });

  it('applies large padding', () => {
    const { container } = render(<Card padding="lg">Test</Card>);
    expect(container.firstChild).toHaveClass('p-8');
  });

  it('applies clickable styles when clickable is true', () => {
    const { container } = render(<Card clickable>Test</Card>);
    expect(container.firstChild).toHaveClass('cursor-pointer');
    expect(container.firstChild).toHaveClass('focus:outline-none');
    expect(container.firstChild).toHaveClass('focus:ring-2');
  });

  it('does not have clickable styles when clickable is false', () => {
    const { container } = render(<Card clickable={false}>Test</Card>);
    expect(container.firstChild).not.toHaveClass('cursor-pointer');
  });

  it('renders header when provided', () => {
    render(<Card header={<h2 data-testid="header">Card Header</h2>}>Content</Card>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(<Card footer={<div data-testid="footer">Card Footer</div>}>Content</Card>);
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Test</Card>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>Test</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has rounded corners', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('rounded-xl');
  });

  it('has flex column layout', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('flex');
    expect(container.firstChild).toHaveClass('flex-col');
  });

  it('renders as Link when as prop is provided with href', () => {
    const { container } = render(
      <Card as="a" href="/test">
        Link Card
      </Card>
    );
    expect(container.firstChild).toHaveAttribute('href', '/test');
  });

  it('has hover transition', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('transition-all');
    expect(container.firstChild).toHaveClass('duration-200');
  });
});
