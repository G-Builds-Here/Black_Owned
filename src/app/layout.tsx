'use client';

import type { Metadata } from 'next';
import { useEffect } from 'react';
import './globals.css';
import { initWebVitals, checkPerformanceThresholds } from './web-vitals';

export const metadata: Metadata = {
  title: 'Black Owned - Celebrating Black Excellence',
  description: 'A platform celebrating Black-owned businesses and Black American and African history.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // Initialize Web Vitals tracking
    initWebVitals();

    // Check performance thresholds after page loads
    window.addEventListener('load', () => {
      const { passed, results } = checkPerformanceThresholds();
      console.log('[Performance Check]', passed ? 'PASSED' : 'FAILED');
      results.forEach((r) => {
        console.log(`  ${r.metric}: ${r.value.toFixed(3)} (threshold: ${r.threshold}) [${r.status}]`);
      });
    });
  }, []);

  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
