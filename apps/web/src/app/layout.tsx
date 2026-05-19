import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'DiveChef — Personal dive intelligence for Shearwater divers',
    template: '%s · DiveChef',
  },
  description:
    'Sync your Shearwater dive computer and see what every dive taught you. Honest verification tiers; closed beta on iOS + Android.',
  metadataBase: new URL('https://www.divechef.com'),
  openGraph: {
    title: 'DiveChef — Personal dive intelligence',
    description:
      'Sync your Shearwater dive computer and see what every dive taught you. Closed beta.',
    url: 'https://www.divechef.com',
    siteName: 'DiveChef',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DiveChef — Personal dive intelligence',
    description:
      'Sync your Shearwater dive computer and see what every dive taught you.',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
