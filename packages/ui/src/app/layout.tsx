import type { Metadata } from "next";
import "../app/globals.css";

export const metadata: Metadata = {
  title: "Black Owned UI",
  description: "UI components for Black Owned - Celebrating Black business ownership",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Subtle heritage pattern background accent */}
        <div className="pattern-accent" style={{ minHeight: "100vh" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
