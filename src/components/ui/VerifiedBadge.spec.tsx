import React from 'react';
import { render, screen } from '@testing-library/react';
import VerifiedBadge from './VerifiedBadge';

describe('VerifiedBadge', () => {
  it('renders with default label', () => {
    render(<VerifiedBadge />);
    expect(screen.getByRole('status')).toHaveTextContent('Verified');
  });

  it('renders with custom label', () => {
    render(<VerifiedBadge label="Verified Business" />);
    expect(screen.getByRole('status')).toHaveTextContent('Verified Business');
  });

  it('displays checkmark icon by default', () => {
    const { container } = render(<VerifiedBadge />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('hides icon when showIcon is false', () => {
    const { container } = render(<VerifiedBadge showIcon={false} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('supports custom icon', () => {
    const customIcon = <span data-testid="custom-icon">✓</span>;
    const { getByTestId } = render(<VerifiedBadge icon={customIcon} />);
    expect(getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { container: small } = render(<VerifiedBadge size="sm" />);
    const { container: medium } = render(<VerifiedBadge size="md" />);
    const { container: large } = render(<VerifiedBadge size="lg" />);

    expect(small.firstChild).toHaveClass('px-2 py-0.5 text-xs');
    expect(medium.firstChild).toHaveClass('px-2.5 py-1 text-sm');
    expect(large.firstChild).toHaveClass('px-3 py-1.5 text-base');
  });

  it('applies custom className', () => {
    const { container } = render(<VerifiedBadge className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('has proper ARIA label', () => {
    render(<VerifiedBadge label="Verified Seller" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Verified Seller');
  });

  it('has green background and white text', () => {
    const { container } = render(<VerifiedBadge />);
    expect(container.firstChild).toHaveClass('bg-green-600');
    expect(container.firstChild).toHaveClass('text-white');
  });

  it('has rounded shape', () => {
    const { container } = render(<VerifiedBadge />);
    expect(container.firstChild).toHaveClass('rounded-full');
  });
});
