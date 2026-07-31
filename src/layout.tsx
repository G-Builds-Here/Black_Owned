import type { Metadata } from 'next';
import './globals.css';

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
        {children}
      </body>
    </html>
  );
}
