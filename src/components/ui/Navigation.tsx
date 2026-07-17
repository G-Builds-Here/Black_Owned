'use client';

import React, { useState } from 'react';
import Button from './Button';

export interface NavigationProps {
  onNavigate?: (section: 'directory' | 'admin' | 'user' | 'home') => void;
}

export function Navigation({ onNavigate = () => {} }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Home', href: '#home', section: 'home' as const },
    { label: 'Directory', href: '#directory', section: 'directory' as const },
    { label: 'About', href: '#about', section: 'home' as const },
    { label: 'Contact', href: '#contact', section: 'home' as const },
  ];

  const handleNavClick = (section: string) => {
    onNavigate(section as 'directory' | 'admin' | 'user' | 'home');
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-neutral-900 text-white sticky top-0 z-50 shadow-lg" role="navigation" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-heritage-ochre to-heritage-gold rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">BO</span>
            </div>
            <span className="text-xl font-bold font-display">Black Owned</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => handleNavClick(item.section)}
                className="text-neutral-300 hover:text-white transition-colors font-medium"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* User Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavClick('admin')}
              className="text-neutral-300 hover:text-white"
            >
              Admin Console
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleNavClick('user')}
            >
              Sign In
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-neutral-300 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-neutral-800">
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => handleNavClick(item.section)}
                  className="text-neutral-300 hover:text-white transition-colors font-medium py-2"
                >
                  {item.label}
                </a>
              ))}
              <div className="pt-4 border-t border-neutral-800 flex flex-col gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNavClick('admin')}
                  className="text-neutral-300 hover:text-white justify-center"
                >
                  Admin Console
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleNavClick('user')}
                  className="justify-center"
                >
                  Sign In
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navigation;
