'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export interface MobileBottomNavProps {
  activeSection?: 'home' | 'directory' | 'admin';
  onNavigate?: (section: 'home' | 'directory' | 'admin') => void;
}

/**
 * Mobile Bottom Navigation Bar
 *
 * WCAG 2.1 compliant with:
 * - Minimum 44px touch targets
 * - Clear visual feedback for active state
 * - Screen reader accessible labels
 * - Bottom navigation pattern for mobile ergonomics
 */
export function MobileBottomNav({ activeSection = 'home', onNavigate = () => {} }: MobileBottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Home',
      href: '/',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      section: 'home' as const,
    },
    {
      label: 'Directory',
      href: '/directory',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      section: 'directory' as const,
    },
    {
      label: 'Admin',
      href: '/admin',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      section: 'admin' as const,
    },
  ];

  const handleNavClick = (section: 'home' | 'directory' | 'admin') => {
    onNavigate(section);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden bg-neutral-900 border-t border-neutral-800 z-50"
      role="navigation"
      aria-label="Mobile bottom navigation"
    >
      <div className="flex justify-around items-stretch h-16">
        {navItems.map((item) => {
          const isActive = activeSection === item.section ||
            (item.section === 'home' && pathname === '/') ||
            (item.section === 'directory' && pathname?.startsWith('/directory')) ||
            (item.section === 'admin' && pathname?.startsWith('/admin'));

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => handleNavClick(item.section)}
              className={`
                flex-1 flex flex-col items-center justify-center
                min-h-16 min-w-[60px]
                transition-colors duration-150
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-heritage-ochre focus-visible:ring-inset
                ${isActive
                  ? 'text-heritage-gold bg-neutral-800'
                  : 'text-neutral-400 hover:text-neutral-200'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="mb-1" aria-hidden="true">
                {item.icon}
              </span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileBottomNav;
