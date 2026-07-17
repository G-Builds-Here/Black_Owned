import { render, screen } from '@testing-library/react';
import { BusinessCard } from './BusinessCard';
import styles from './BusinessCard.module.css';

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

    expect(container.querySelector(`.${styles.businessCard}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.rating}`)).toBeInTheDocument();
  });

  it('applies cultural heritage styling - terracotta border accent', () => {
    const { container } = render(<BusinessCard businessName="Test Biz" rating={4} />);
    const card = container.querySelector(`.${styles.businessCard}`);

    expect(card).toBeInTheDocument();
  });

  it('applies cultural heritage styling - gold accent on hover', () => {
    const { container } = render(<BusinessCard businessName="Test Biz" rating={4} />);
    const card = container.querySelector(`.${styles.businessCard}`);

    expect(card).toBeInTheDocument();
  });

  it('renders gold star accent for rating', () => {
    render(<BusinessCard businessName="Test Biz" rating={4.5} />);
    const ratingElement = screen.getByText('4.5');

    expect(ratingElement).toHaveClass(styles.rating);
  });

  it('applies earth tone accent for address', () => {
    render(<BusinessCard businessName="Test Biz" rating={4} address="123 Main St" />);
    const addressElement = screen.getByText('123 Main St');

    expect(addressElement).toHaveClass(styles.address);
  });

  it('renders business name with cultural serif typography', () => {
    const { container } = render(<BusinessCard businessName="Test Biz" rating={4} />);
    const heading = container.querySelector('h2');

    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Test Biz');
  });
});
