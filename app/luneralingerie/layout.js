/**
 * LUNERA layout — served at /luneralingerie (localhost)
 * and rewritten from luneralingerie.com/ in production.
 */

import "./globals.css";
import { getServerSideInfo } from '@/lib/firestore-server';

export async function generateMetadata() {
  const storefront = 'LUNERA';
  const info = await getServerSideInfo('en', storefront);

  const title = info.companyName
    ? `${info.companyName}${info.companyTagline ? ` - ${info.companyTagline}` : ''}`
    : 'Lunera Lingerie';

  const description = info.heroDescription || info.companyTagline ||
    'Lunera Lingerie — elegant lingerie for Kosovo.';

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: 'https://luneralingerie.com',
    },
    alternates: {
      canonical: 'https://luneralingerie.com',
    },
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/favicon.ico', sizes: 'any' },
      ],
    },
  };
}

export default function LuneraLayout({ children }) {
  return <>{children}</>;
}
