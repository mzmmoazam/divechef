import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: 'italic',
  subsets: ['latin'],
  variable: '--font-instrument-serif',
});

export const metadata: Metadata = {
  title: {
    default: 'DiveChef — Personal dive intelligence',
    template: '%s · DiveChef',
  },
  description:
    'Sync your dive computer and see what every dive taught you. Starts with Shearwater; more vendors coming. Honest verification tiers; closed beta on iOS + Android.',
  metadataBase: new URL('https://www.divechef.com'),
  openGraph: {
    title: 'DiveChef — Personal dive intelligence',
    description:
      'Sync your dive computer and see what every dive taught you. Starts with Shearwater; more vendors coming. Closed beta.',
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
      'Sync your dive computer and see what every dive taught you. Starts with Shearwater; more vendors coming.',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0a1220',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
