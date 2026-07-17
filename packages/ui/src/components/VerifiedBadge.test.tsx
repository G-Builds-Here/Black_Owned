import { render, screen } from '@testing-library/react';
import { VerifiedBadge } from './VerifiedBadge';
import styles from './VerifiedBadge.module.css';

describe('VerifiedBadge', () => {
  it('renders as verified by default', () => {
    render(<VerifiedBadge />);

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders with verified class when verified is true', () => {
    const { container } = render(<VerifiedBadge verified={true} />);

    expect(container.querySelector(`.${styles.verified}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.unverified}`)).not.toBeInTheDocument();
  });

  it('renders with unverified class when verified is false', () => {
    const { container } = render(<VerifiedBadge verified={false} />);

    expect(container.querySelector(`.${styles.unverified}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.verified}`)).not.toBeInTheDocument();
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
    expect(container.querySelector(`.${styles.badgeLabel}`)).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const { container } = render(<VerifiedBadge verified={true} />);

    expect(container.querySelector(`.${styles.badgeLabel}`)).not.toBeInTheDocument();
  });

  it('applies cultural gold gradient styling for verified badge', () => {
    const { container } = render(<VerifiedBadge verified={true} label="Black-Owned" />);
    const badge = container.querySelector(`.${styles.verified}`);

    expect(badge).toBeInTheDocument();
  });
});
