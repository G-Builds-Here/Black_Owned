import { render, screen } from '@testing-library/react';
import { ResponsiveImage } from './ResponsiveImage';

describe('ResponsiveImage', () => {
  const mockSrc = '/images/test-image.jpg';
  const mockAlt = 'Test image';

  it('renders with required props', () => {
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} priority={true} />);

    const img = screen.getByRole('img', { name: mockAlt });
    expect(img).toBeInTheDocument();
  });

  it('has lazy loading by default', () => {
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} priority={true} />);

    const img = screen.getByRole('img', { name: mockAlt });
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('applies custom className', () => {
    const customClass = 'custom-image-class';
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} className={customClass} priority={true} />);

    // The outer div should have the custom class
    const container = document.querySelector('div.relative.overflow-hidden');
    expect(container).toHaveClass(customClass);
  });

  it('applies correct object-fit style', () => {
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} objectFit="contain" priority={true} />);

    const img = screen.getByRole('img', { name: mockAlt });
    expect(img).toHaveStyle('object-fit: contain');
  });

  it('applies aspect ratio when provided', () => {
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} aspectRatio="16/9" priority={true} />);

    // The outer div should have aspect-ratio style
    const container = document.querySelector('div.relative.overflow-hidden');
    expect(container).toHaveStyle('aspect-ratio: 16/9');
  });

  it('renders picture element with source fallbacks', () => {
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} priority={true} />);

    const picture = screen.getByRole('img', { name: mockAlt }).closest('picture');
    expect(picture).toBeInTheDocument();
  });

  it('renders eager loading when specified', () => {
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} loading="eager" priority={true} />);

    const img = screen.getByRole('img', { name: mockAlt });
    expect(img).toHaveAttribute('loading', 'eager');
  });

  it('has loading placeholder', () => {
    render(<ResponsiveImage src={mockSrc} alt={mockAlt} priority={false} />);

    // Should have a placeholder div with animate-pulse class
    const placeholder = document.querySelector('.animate-pulse');
    expect(placeholder).toBeInTheDocument();
  });
});
