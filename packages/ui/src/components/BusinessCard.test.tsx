import { render, screen } from '@testing-library/react';
import { BusinessCard } from './BusinessCard';

describe('BusinessCard', () => {
  it('renders minimal props without crash', () => {
    render(<BusinessCard businessName="Test Biz" rating={4} />);

    expect(screen.getByText('Test Biz')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
  });

  it('renders optional description when provided', () => {
    render(<BusinessCard businessName="Test Biz" rating={4} description="A great business" />);

    expect(screen.getByText('A great business')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<BusinessCard businessName="Test Biz" rating={4} />);

    expect(screen.queryByText('description')).not.toBeInTheDocument();
  });

  it('renders optional address when provided', () => {
    render(<BusinessCard businessName="Test Biz" rating={4} address="123 Main St" />);

    expect(screen.getByText('123 Main St')).toBeInTheDocument();
  });

  it('has correct CSS classes', () => {
    const { container } = render(<BusinessCard businessName="Test Biz" rating={4} />);

    expect(container.querySelector('.business-card')).toBeInTheDocument();
    expect(container.querySelector('.rating')).toBeInTheDocument();
  });
});
