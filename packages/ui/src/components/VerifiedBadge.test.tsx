import { render, screen } from '@testing-library/react';
import { VerifiedBadge } from './VerifiedBadge';

describe('VerifiedBadge', () => {
  it('renders as verified by default', () => {
    render(<VerifiedBadge />);

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders with verified class when verified is true', () => {
    const { container } = render(<VerifiedBadge verified={true} />);

    expect(container.querySelector('.verified')).toBeInTheDocument();
    expect(container.querySelector('.unverified')).not.toBeInTheDocument();
  });

  it('renders with unverified class when verified is false', () => {
    const { container } = render(<VerifiedBadge verified={false} />);

    expect(container.querySelector('.unverified')).toBeInTheDocument();
    expect(container.querySelector('.verified')).not.toBeInTheDocument();
  });

  it('displays checkmark for verified state', () => {
    const { container } = render(<VerifiedBadge verified={true} />);

    expect(container.textContent).toContain('✓');
  });

  it('displays circle for unverified state', () => {
    const { container } = render(<VerifiedBadge verified={false} />);

    expect(container.textContent).toContain('○');
  });

  it('renders label when provided', () => {
    const { container } = render(<VerifiedBadge verified={true} label="Verified" />);

    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(container.querySelector('.badge-label')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const { container } = render(<VerifiedBadge verified={true} />);

    expect(container.querySelector('.badge-label')).not.toBeInTheDocument();
  });
});
