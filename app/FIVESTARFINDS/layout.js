import { Metadata } from 'next';
import { StorefrontProvider } from '@/lib/storefront-context';
import './globals.css';

export const metadata = {
  title: 'Five-Star Finds - Top Rated. Always.',
  description: 'Discover top-rated products at Five-Star Finds. Curated selection of premium items with worldwide shipping.',
  robots: {
    index: false, // TEMPORARY: Block indexing while site is under construction
    follow: false, // TEMPORARY: Block following links while site is under construction
  },
  openGraph: {
    title: 'Five-Star Finds - Top Rated. Always.',
    description: 'Discover top-rated products at Five-Star Finds.',
    type: 'website',
    url: 'https://www.fivestarfinds.com',
  },
  alternates: {
    canonical: 'https://www.fivestarfinds.com',
  },
};

export default function FiveStarFindsLayout({ children }) {
  return (
    <StorefrontProvider>
      {children}
    </StorefrontProvider>
  );
}

