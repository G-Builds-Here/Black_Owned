'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';

// Current component notes (source of truth: Badge.tsx):
// - Variants are soft tints (e.g. primary = bg-heritage-ochre/10 text-heritage-ochre),
//   not solid fills with white text.
// - Sizes are only sm and md (lg was removed); the default size is md.
// - The shape is rounded-md by default; the pill prop switches it to rounded-full.
// - The old rounded, fontWeight, textTransform, and letterSpacing props were
//   removed in the redesign, so their tests were dropped.

describe('Badge', () => {
  it('renders children correctly', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText(/test badge/i)).toBeInTheDocument();
  });

  it('applies default variant (default)', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-neutral-100');
    expect(container.firstChild).toHaveClass('text-neutral-700');
    expect(container.firstChild).toHaveClass('border-neutral-200');
  });

  it('applies primary variant styles', () => {
    const { container } = render(<Badge variant="primary">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-ochre/10');
    expect(container.firstChild).toHaveClass('text-heritage-ochre');
  });

  it('applies secondary variant styles', () => {
    const { container } = render(<Badge variant="secondary">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-jade/10');
    expect(container.firstChild).toHaveClass('text-heritage-jade');
  });

  it('applies success variant styles', () => {
    const { container } = render(<Badge variant="success">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-jade/10');
    expect(container.firstChild).toHaveClass('text-heritage-jade');
  });

  it('applies warning variant styles', () => {
    const { container } = render(<Badge variant="warning">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-amber/10');
    expect(container.firstChild).toHaveClass('text-heritage-amber');
  });

  it('applies error variant styles', () => {
    const { container } = render(<Badge variant="error">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-crimson/10');
    expect(container.firstChild).toHaveClass('text-heritage-crimson');
  });

  it('applies info variant styles', () => {
    const { container } = render(<Badge variant="info">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-royal/10');
    expect(container.firstChild).toHaveClass('text-heritage-royal');
  });

  it('applies default size (md)', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('px-2.5');
    expect(container.firstChild).toHaveClass('py-1');
    expect(container.firstChild).toHaveClass('text-sm');
  });

  it('applies small size', () => {
    const { container } = render(<Badge size="sm">Test</Badge>);
    expect(container.firstChild).toHaveClass('px-2');
    expect(container.firstChild).toHaveClass('py-0.5');
    expect(container.firstChild).toHaveClass('text-xs');
  });

  it('applies medium size', () => {
    const { container } = render(<Badge size="md">Test</Badge>);
    expect(container.firstChild).toHaveClass('px-2.5');
    expect(container.firstChild).toHaveClass('py-1');
    expect(container.firstChild).toHaveClass('text-sm');
  });

  it('does not apply pill shape by default', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).not.toHaveClass('rounded-full');
    expect(container.firstChild).toHaveClass('rounded-md');
  });

  it('applies pill shape when pill is true', () => {
    const { container } = render(<Badge pill>Test</Badge>);
    expect(container.firstChild).toHaveClass('rounded-full');
  });

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom-class">Test</Badge>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('has inline-flex display', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('inline-flex');
    expect(container.firstChild).toHaveClass('items-center');
  });

  it('has font-medium by default', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('font-medium');
  });

  it('has transition styles', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('transition-colors');
    expect(container.firstChild).toHaveClass('duration-150');
  });
});
