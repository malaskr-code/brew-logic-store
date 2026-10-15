import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import ClientStorefront from './storefront-client';
import '../index.css';

export const metadata: Metadata = {
  title: 'Brew Logic',
  description: 'Brew Logic — coffee tools and locally roasted beans in Kuwait.',
  icons: { icon: '/favicon.svg' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Brew Logic',
    description: 'Brew Logic — coffee tools and locally roasted beans in Kuwait.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Brew Logic' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><ClientStorefront />{children}</body>
    </html>
  );
}
