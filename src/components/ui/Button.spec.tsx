'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button';

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('applies default variant (primary) and size (md)', () => {
    const { container } = render(<Button>Test</Button>);
    expect(container.firstChild).toHaveClass('bg-heritage-ochre');
    expect(container.firstChild).toHaveClass('px-5');
    expect(container.firstChild).toHaveClass('py-2.5');
  });

  it('applies primary variant styles', () => {
    const { container } = render(<Button variant="primary">Test</Button>);
    expect(container.firstChild).toHaveClass('bg-heritage-ochre');
    expect(container.firstChild).toHaveClass('text-white');
  });

  it('applies secondary variant styles', () => {
    const { container } = render(<Button variant="secondary">Test</Button>);
    expect(container.firstChild).toHaveClass('bg-heritage-jade');
  });

  it('applies tertiary variant styles', () => {
    const { container } = render(<Button variant="tertiary">Test</Button>);
    expect(container.firstChild).toHaveClass('bg-heritage-gold');
  });

  it('applies ghost variant styles', () => {
    const { container } = render(<Button variant="ghost">Test</Button>);
    expect(container.firstChild).toHaveClass('bg-transparent');
    expect(container.firstChild).toHaveClass('text-neutral-700');
  });

  it('applies danger variant styles', () => {
    const { container } = render(<Button variant="danger">Test</Button>);
    expect(container.firstChild).toHaveClass('bg-heritage-crimson');
  });

  it('applies small size styles', () => {
    const { container } = render(<Button size="sm">Test</Button>);
    expect(container.firstChild).toHaveClass('px-3');
    expect(container.firstChild).toHaveClass('py-1.5');
    expect(container.firstChild).toHaveClass('text-sm');
  });

  it('applies medium size styles', () => {
    const { container } = render(<Button size="md">Test</Button>);
    expect(container.firstChild).toHaveClass('px-5');
    expect(container.firstChild).toHaveClass('py-2.5');
    expect(container.firstChild).toHaveClass('text-base');
  });

  it('applies large size styles', () => {
    const { container } = render(<Button size="lg">Test</Button>);
    expect(container.firstChild).toHaveClass('px-7');
    expect(container.firstChild).toHaveClass('py-3.5');
    expect(container.firstChild).toHaveClass('text-lg');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled when loading', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows loading spinner when loading', () => {
    render(<Button isLoading>Load</Button>);
    expect(screen.getByRole('button')).toHaveTextContent(/load/i);
    expect(screen.getByRole('button')).toContainElement(screen.getByClass('animate-spin'));
  });

  it('shows loading text when provided', () => {
    render(<Button isLoading loadingText="Please wait">Original</Button>);
    expect(screen.getByRole('button')).toHaveTextContent(/please wait/i);
  });

  it('displays left icon', () => {
    render(<Button leftIcon={<span data-testid="icon">+</span>}>Click</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('displays right icon', () => {
    render(<Button rightIcon={<span data-testid="icon">{">"}</span>}>Click</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies fullWidth class when fullWidth prop is true', () => {
    const { container } = render(<Button fullWidth>Test</Button>);
    expect(container.firstChild).toHaveClass('w-full');
  });

  it('applies custom className', () => {
    const { container } = render(<Button className="custom-class">Test</Button>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const handleClick = jest.fn();
    render(<Button disabled onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const handleClick = jest.fn();
    render(<Button isLoading onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Test</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('has proper focus styles', () => {
    const { container } = render(<Button>Test</Button>);
    expect(container.firstChild).toHaveClass('focus:outline-none');
    expect(container.firstChild).toHaveClass('focus:ring-2');
  });

  it('has active state scale transform', () => {
    const { container } = render(<Button>Test</Button>);
    expect(container.firstChild).toHaveClass('active:scale-[0.98]');
  });

  it('has aria-busy attribute when loading', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('loading spinner has aria-hidden attribute', () => {
    render(<Button isLoading>Loading</Button>);
    const spinner = screen.getByRole('button').querySelector('svg');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });

  it('has focus ring offset for keyboard navigation', () => {
    const { container } = render(<Button>Test</Button>);
    expect(container.firstChild).toHaveClass('focus:ring-offset-2');
  });
});
