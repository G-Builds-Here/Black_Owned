import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBottomNav } from './MobileBottomNav';

describe('MobileBottomNav', () => {
  it('renders all navigation items', () => {
    render(<MobileBottomNav />);

    expect(screen.getByRole('navigation', { name: /mobile bottom navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /directory/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument();
  });

  it('has minimum 44px touch targets per WCAG (verified via CSS classes)', () => {
    render(<MobileBottomNav />);

    const navItems = screen.getAllByRole('link');
    navItems.forEach((item) => {
      // Verify the min-h-16 class is applied (64px > 44px)
      expect(item).toHaveClass('min-h-16');
      // Verify min-w-[60px] is applied
      expect(item).toHaveClass('min-w-[60px]');
    });
  });

  it('shows active state for current section', () => {
    render(<MobileBottomNav activeSection="directory" />);

    const directoryLink = screen.getByRole('link', { name: /directory/i });
    expect(directoryLink).toHaveClass('text-heritage-gold');
  });

  it('calls onNavigate when item is clicked', () => {
    const mockNavigate = jest.fn();
    render(<MobileBottomNav onNavigate={mockNavigate} />);

    const homeLink = screen.getByRole('link', { name: /home/i });
    fireEvent.click(homeLink);

    expect(mockNavigate).toHaveBeenCalledWith('home');
  });

  it('has proper ARIA labels for accessibility', () => {
    render(<MobileBottomNav />);

    expect(screen.getByRole('navigation', { name: /mobile bottom navigation/i })).toBeInTheDocument();
  });

  it('has hidden on desktop via md:hidden class', () => {
    render(<MobileBottomNav />);

    const nav = screen.getByRole('navigation', { name: /mobile bottom navigation/i });
    expect(nav).toHaveClass('md:hidden');
  });
});
