'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';

describe('Badge', () => {
  it('renders children correctly', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText(/test badge/i)).toBeInTheDocument();
  });

  it('applies default variant (default)', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-neutral-100');
    expect(container.firstChild).toHaveClass('text-neutral-800');
  });

  it('applies primary variant styles', () => {
    const { container } = render(<Badge variant="primary">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-ochre');
    expect(container.firstChild).toHaveClass('text-white');
  });

  it('applies secondary variant styles', () => {
    const { container } = render(<Badge variant="secondary">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-jade');
    expect(container.firstChild).toHaveClass('text-white');
  });

  it('applies success variant styles', () => {
    const { container } = render(<Badge variant="success">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-green-100');
    expect(container.firstChild).toHaveClass('text-green-800');
  });

  it('applies warning variant styles', () => {
    const { container } = render(<Badge variant="warning">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-amber');
    expect(container.firstChild).toHaveClass('text-white');
  });

  it('applies error variant styles', () => {
    const { container } = render(<Badge variant="error">Test</Badge>);
    expect(container.firstChild).toHaveClass('bg-heritage-crimson');
    expect(container.firstChild).toHaveClass('text-white');
  });

  it('applies default size (sm)', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('px-2');
    expect(container.firstChild).toHaveClass('py-0.5');
    expect(container.firstChild).toHaveClass('text-xs');
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

  it('applies large size', () => {
    const { container } = render(<Badge size="lg">Test</Badge>);
    expect(container.firstChild).toHaveClass('px-3');
    expect(container.firstChild).toHaveClass('py-1.5');
    expect(container.firstChild).toHaveClass('text-base');
  });

  it('applies rounded-full shape by default', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('rounded-full');
  });

  it('applies rounded-lg when rounded is lg', () => {
    const { container } = render(<Badge rounded="lg">Test</Badge>);
    expect(container.firstChild).toHaveClass('rounded-lg');
  });

  it('applies rounded-none when rounded is none', () => {
    const { container } = render(<Badge rounded="none">Test</Badge>);
    expect(container.firstChild).not.toHaveClass('rounded-full');
    expect(container.firstChild).not.toHaveClass('rounded-lg');
  });

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom-class">Test</Badge>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('has inline-flex display', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstChild).toHaveClass('inline-flex');
    expect(container.firstChild).toHaveClass('items-center');
    expect(container.firstChild).toHaveClass('justify-center');
  });

  it('has font-medium when medium font weight', () => {
    const { container } = render(<Badge fontWeight="medium">Test</Badge>);
    expect(container.firstChild).toHaveClass('font-medium');
  });

  it('has font-semibold when semibold font weight', () => {
    const { container } = render(<Badge fontWeight="semibold">Test</Badge>);
    expect(container.firstChild).toHaveClass('font-semibold');
  });

  it('has font-bold when bold font weight', () => {
    const { container } = render(<Badge fontWeight="bold">Test</Badge>);
    expect(container.firstChild).toHaveClass('font-bold');
  });

  it('has uppercase when textTransform is uppercase', () => {
    const { container } = render(<Badge textTransform="uppercase">Test</Badge>);
    expect(container.firstChild).toHaveClass('uppercase');
  });

  it('has tracking-wide when letterSpacing is wide', () => {
    const { container } = render(<Badge letterSpacing="wide">Test</Badge>);
    expect(container.firstChild).toHaveClass('tracking-wide');
  });
});
