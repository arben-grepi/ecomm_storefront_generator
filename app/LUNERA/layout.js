import { Metadata } from 'next';
import { StorefrontProvider } from '@/lib/storefront-context';

// TEMPORARY: Site is under construction - blocking search engine indexing until site is finished
// TODO: Change robots to { index: true, follow: true } once site is ready for production
export const metadata = {
  title: 'Blerinas - Premium Fashion & Accessories',
  description: 'Discover premium fashion and accessories at Blerinas. Shop the latest collections with worldwide shipping.',
  robots: {
    index: false, // TEMPORARY: Block indexing while site is under construction
    follow: false, // TEMPORARY: Block following links while site is under construction
  },
  openGraph: {
    title: 'Blerinas - Premium Fashion & Accessories',
    description: 'Discover premium fashion and accessories at Blerinas.',
    type: 'website',
    url: 'https://www.blerinas.com',
  },
  alternates: {
    canonical: 'https://www.blerinas.com',
  },
};

export default function LuneraLayout({ children }) {
  return (
    <StorefrontProvider>
      {children}
    </StorefrontProvider>
  );
}
