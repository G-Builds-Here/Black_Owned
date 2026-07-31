'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from './Button';

export interface NavigationProps {
  onNavigate?: (section: 'directory' | 'admin' | 'user' | 'home') => void;
}

export function Navigation({ onNavigate = () => {} }: NavigationProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Home', href: '/', section: 'home' as const },
    { label: 'Directory', href: '/directory', section: 'directory' as const },
    { label: 'About', href: '/#about', section: 'home' as const },
    { label: 'Contact', href: '/#contact', section: 'home' as const },
  ];

  const handleNavClick = (section: string, href: string) => {
    onNavigate(section as 'directory' | 'admin' | 'user' | 'home');
    if (href.startsWith('/')) {
      router.push(href);
    }
    setMobileMenuOpen(false);
  };

  const handleLogoClick = () => {
    router.push('/');
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-neutral-900 text-white sticky top-0 z-50 shadow-lg" role="navigation" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={handleLogoClick}
            className="flex items-center gap-2 group"
            aria-label="Black Owned - Go to home"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-heritage-ochre to-heritage-gold rounded-lg flex items-center justify-center group-hover:opacity-90 transition-opacity">
              <span className="text-white font-bold text-lg">BO</span>
            </div>
            <span className="text-xl font-bold font-display text-white group-hover:text-heritage-ochre transition-colors">Black Owned</span>
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => {
                  onNavigate(item.section);
                  setMobileMenuOpen(false);
                }}
                className="text-neutral-300 hover:text-heritage-ochre transition-colors font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* User Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onNavigate('admin');
                router.push('/admin');
              }}
              className="text-neutral-300 hover:text-white"
            >
              Admin Console
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onNavigate('user');
              }}
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
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => {
                    onNavigate(item.section);
                    setMobileMenuOpen(false);
                  }}
                  className="text-neutral-300 hover:text-heritage-ochre transition-colors font-medium py-2"
                >
                  {item.label}
                </Link>
              ))}
              <div className="pt-4 border-t border-neutral-800 flex flex-col gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onNavigate('admin');
                    router.push('/admin');
                  }}
                  className="text-neutral-300 hover:text-white justify-center"
                >
                  Admin Console
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onNavigate('user');
                  }}
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
