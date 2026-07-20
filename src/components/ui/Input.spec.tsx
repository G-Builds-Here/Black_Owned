'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Input from './Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText(/enter text/i)).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label="Input Label" />);
    expect(screen.getByText(/input label/i)).toBeInTheDocument();
  });

  it('renders with error message', () => {
    render(<Input label="Input" error="This is an error" />);
    expect(screen.getByText(/this is an error/i)).toBeInTheDocument();
  });

  it('applies default size (md)', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('px-4');
    expect(input).toHaveClass('py-2');
  });

  it('applies small size', () => {
    const { container } = render(<Input size="sm" />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('px-3');
    expect(input).toHaveClass('py-1.5');
    expect(input).toHaveClass('text-sm');
  });

  it('applies medium size', () => {
    const { container } = render(<Input size="md" />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('px-4');
    expect(input).toHaveClass('py-2');
    expect(input).toHaveClass('text-base');
  });

  it('applies large size', () => {
    const { container } = render(<Input size="lg" />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('px-5');
    expect(input).toHaveClass('py-3');
    expect(input).toHaveClass('text-lg');
  });

  it('applies error styles when error is provided', () => {
    const { container } = render(<Input error="Error message" />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('border-heritage-crimson');
  });

  it('applies disabled styles when disabled', () => {
    const { container } = render(<Input disabled />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('bg-neutral-100');
    expect(input).toHaveClass('cursor-not-allowed');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('applies custom className', () => {
    const { container } = render(<Input className="custom-class" />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('custom-class');
  });

  it('calls onChange handler when value changes', () => {
    const handleChange = jest.fn();
    render(<Input onChange={handleChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('calls onBlur handler when blurred', () => {
    const handleBlur = jest.fn();
    render(<Input onBlur={handleBlur} />);
    fireEvent.blur(screen.getByRole('textbox'));
    expect(handleBlur).toHaveBeenCalledTimes(1);
  });

  it('calls onFocus handler when focused', () => {
    const handleFocus = jest.fn();
    render(<Input onFocus={handleFocus} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(handleFocus).toHaveBeenCalledTimes(1);
  });

  it('displays helper text when provided', () => {
    render(<Input label="Input" helperText="Helper text" />);
    expect(screen.getByText(/helper text/i)).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('has focus ring styles', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('focus:outline-none');
    expect(input).toHaveClass('focus:ring-2');
    expect(input).toHaveClass('focus:ring-heritage-ochre');
  });

  it('has rounded border', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('rounded-lg');
  });

  it('has border by default', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('border');
    expect(input).toHaveClass('border-neutral-300');
  });

  it('has transition styles', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('transition-colors');
    expect(input).toHaveClass('duration-200');
  });

  it('renders with value', () => {
    render(<Input value="Test Value" />);
    expect(screen.getByRole('textbox')).toHaveValue('Test Value');
  });

  it('renders with defaultValue', () => {
    render(<Input defaultValue="Default Value" />);
    expect(screen.getByRole('textbox')).toHaveValue('Default Value');
  });

  it('supports different input types', () => {
    render(<Input type="email" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');
  });

  it('has aria-invalid when error is present', () => {
    render(<Input error="Error" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('has aria-describedby pointing to helper text', () => {
    const { getByRole } = render(<Input label="Input" helperText="Helper" />);
    const input = getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby');
  });
});
