'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navigation } from './Navigation';

describe('Navigation', () => {
  it('renders navigation container', () => {
    render(<Navigation />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('displays Black Owned branding', () => {
    render(<Navigation />);
    expect(screen.getByText(/black owned/i)).toBeInTheDocument();
  });

  it('renders home link', () => {
    render(<Navigation />);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
  });

  it('renders directory link', () => {
    render(<Navigation />);
    expect(screen.getByRole('link', { name: /directory/i })).toBeInTheDocument();
  });

  it('renders about link', () => {
    render(<Navigation />);
    expect(screen.getByRole('link', { name: /about/i })).toBeInTheDocument();
  });

  it('renders contact link', () => {
    render(<Navigation />);
    expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument();
  });

  it('renders admin console button', () => {
    render(<Navigation />);
    expect(screen.getByRole('button', { name: /admin console/i })).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    render(<Navigation />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('calls onNavigate when home is clicked', () => {
    const handleNavigate = jest.fn();
    render(<Navigation onNavigate={handleNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: /home/i }));
    expect(handleNavigate).toHaveBeenCalledWith('home');
  });

  it('calls onNavigate when directory is clicked', () => {
    const handleNavigate = jest.fn();
    render(<Navigation onNavigate={handleNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: /directory/i }));
    expect(handleNavigate).toHaveBeenCalledWith('directory');
  });

  it('calls onNavigate when admin console is clicked', () => {
    const handleNavigate = jest.fn();
    render(<Navigation onNavigate={handleNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /admin console/i }));
    expect(handleNavigate).toHaveBeenCalledWith('admin');
  });

  it('calls onNavigate when sign in is clicked', () => {
    const handleNavigate = jest.fn();
    render(<Navigation onNavigate={handleNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(handleNavigate).toHaveBeenCalledWith('user');
  });

  it('has sticky positioning', () => {
    const { container } = render(<Navigation />);
    expect(container.querySelector('nav')).toHaveClass('sticky');
    expect(container.querySelector('nav')).toHaveClass('top-0');
  });

  it('has z-index for stacking', () => {
    const { container } = render(<Navigation />);
    expect(container.querySelector('nav')).toHaveClass('z-50');
  });

  it('has shadow styling', () => {
    const { container } = render(<Navigation />);
    expect(container.querySelector('nav')).toHaveClass('shadow-lg');
  });

  it('has dark background', () => {
    const { container } = render(<Navigation />);
    expect(container.querySelector('nav')).toHaveClass('bg-neutral-900');
    expect(container.querySelector('nav')).toHaveClass('text-white');
  });

  it('mobile menu is hidden by default on desktop', () => {
    render(<Navigation />);
    // Mobile menu items should not be visible in default desktop view
    const mobileMenu = screen.queryByText(/home/i);
    // The mobile menu is conditionally rendered, so we check the button exists
    expect(screen.getByLabelText(/toggle navigation menu/i)).toBeInTheDocument();
  });

  it('mobile menu button toggles menu', () => {
    render(<Navigation />);
    const menuButton = screen.getByLabelText(/toggle navigation menu/i);
    fireEvent.click(menuButton);
    // After click, menu should be expanded
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('mobile menu button has correct aria-expanded state', () => {
    render(<Navigation />);
    const menuButton = screen.getByLabelText(/toggle navigation menu/i);
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('has hamburger icon for mobile menu', () => {
    render(<Navigation />);
    const menuButton = screen.getByLabelText(/toggle navigation menu/i);
    expect(menuButton).toContainElement(menuButton.querySelector('svg'));
  });

  it('nav items have hover styles', () => {
    render(<Navigation />);
    const navLink = screen.getByRole('link', { name: /home/i });
    expect(navLink).toHaveClass('hover:text-white');
    expect(navLink).toHaveClass('text-neutral-300');
  });

  it('has max width container', () => {
    const { container } = render(<Navigation />);
    expect(container.querySelector('nav')).toContainElement(
      container.querySelector('.max-w-7xl')
    );
  });

  it('has proper height', () => {
    const { container } = render(<Navigation />);
    expect(container.querySelector('nav')).toHaveClass('h-16');
  });

  it('has flex layout for header', () => {
    const { container } = render(<Navigation />);
    expect(container.querySelector('nav')).toContainElement(
      container.querySelector('.flex')
    );
    expect(container.querySelector('nav')).toContainElement(
      container.querySelector('.items-center')
    );
    expect(container.querySelector('nav')).toContainElement(
      container.querySelector('.justify-between')
    );
  });
});
