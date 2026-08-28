import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { NotificationBanner } from '@/components/NotificationBanner';

export const metadata: Metadata = {
  title: 'Black Owned - Celebrating Black Excellence',
  description: 'A platform celebrating Black-owned businesses and Black American and African history.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ToastProvider>
          {children}
          <NotificationBanner />
        </ToastProvider>
      </body>
    </html>
  );
}
