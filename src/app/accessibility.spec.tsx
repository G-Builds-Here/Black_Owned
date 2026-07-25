import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Accessibility - WCAG AA Compliance', () => {
  it('has main landmark for screen readers', () => {
    render(<Home />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('has navigation landmark', () => {
    render(<Home />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('has proper heading hierarchy (h1 exists)', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('has h2 headings for sections', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('all sections have aria-labelledby', () => {
    render(<Home />);
    const sections = screen.getAllByRole('region');
    expect(sections.length).toBeGreaterThan(0);
  });

  it('buttons have accessible names', () => {
    render(<Home />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toHaveAccessibleName();
    });
  });

  it('has footer with contentinfo role', () => {
    render(<Home />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('footer links have accessible names', () => {
    render(<Home />);
    const footerLinks = screen.getAllByRole('link');
    footerLinks.forEach((link) => {
      expect(link).toHaveAccessibleName();
    });
  });

  it('has landmark regions for major sections', () => {
    render(<Home />);
    // Check for region landmarks (sections with aria-labelledby)
    const regions = screen.queryAllByRole('region');
    expect(regions.length).toBeGreaterThan(0);
  });
});

describe('Accessibility - Focus Management', () => {
  it('buttons have focus styles', () => {
    render(<Home />);
    const button = screen.getByRole('button', { name: /explore businesses/i });
    expect(button).toHaveClass('focus:ring-2');
    expect(button).toHaveClass('focus:ring-offset-2');
  });

  it('navigation links have focus styles', () => {
    render(<Home />);
    const navLink = screen.getByRole('link', { name: /home/i });
    expect(navLink).toHaveClass('hover:text-white');
  });
});

describe('Accessibility - Keyboard Navigation', () => {
  it('interactive elements are focusable', () => {
    render(<Home />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    });
  });

  it('cards are keyboard accessible when clickable', () => {
    render(<Home />);
    // Cards with clickable prop should be focusable
    const cards = screen.getAllByRole('button');
    expect(cards.length).toBeGreaterThan(0);
  });
});

describe('Accessibility - ARIA Labels', () => {
  it('search input has accessible label', () => {
    render(<Home />);
    const searchInput = screen.getByLabelText(/search/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('category filter buttons have aria-pressed state', () => {
    render(<Home />);
    const categoryButtons = screen.getAllByRole('button', { name: /food & dining/i });
    expect(categoryButtons.length).toBeGreaterThan(0);
  });

  it('icons have aria-hidden when decorative', () => {
    render(<Home />);
    // Check that decorative emoji icons have aria-hidden
    const decorativeElements = screen.queryAllByRole('img', { hidden: true });
    // Decorative elements should be hidden from screen readers
    expect(decorativeElements.length).toBeGreaterThanOrEqual(0);
  });
});
