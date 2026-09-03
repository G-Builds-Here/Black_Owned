'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Input from './Input';

// Current component notes (source of truth: Input.tsx):
// - No `size` prop (old sm/md/lg size tests removed); the input is always
//   px-4 py-2.5 text-base, with pl-10/pr-10 added when icons are present.
// - No disabled styling classes were ever part of the redesign; the native
//   `disabled` attribute (tested below) is the only disabled behavior.

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

  it('applies default padding and font size', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('px-4');
    expect(input).toHaveClass('py-2.5');
    expect(input).toHaveClass('text-base');
  });

  it('adds left padding when leftIcon is provided', () => {
    const { container } = render(<Input leftIcon={<span>icon</span>} />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('pl-10');
  });

  it('adds right padding when rightIcon is provided', () => {
    const { container } = render(<Input rightIcon={<span>icon</span>} />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('pr-10');
  });

  it('renders left and right icons', () => {
    render(<Input leftIcon={<span>left</span>} rightIcon={<span>right</span>} />);
    expect(screen.getByText('left')).toBeInTheDocument();
    expect(screen.getByText('right')).toBeInTheDocument();
  });

  it('applies error styles when error is provided', () => {
    const { container } = render(<Input error="Error message" />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('border-heritage-crimson');
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
    expect(input).toHaveClass('transition-all');
    expect(input).toHaveClass('duration-150');
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
