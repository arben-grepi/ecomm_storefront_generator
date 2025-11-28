import { StorefrontProvider } from '@/lib/storefront-context';
import { getServerSideInfo } from '@/lib/firestore-server';
import './globals.css';

export async function generateMetadata() {
  // 🔍 FIVESTARFINDS LAYOUT METADATA - Set breakpoint here in Cursor
  const storefront = 'FIVESTARFINDS';
  const info = await getServerSideInfo('en', storefront);
  
  // Generate metadata from Info document
  const title = info.companyName 
    ? `${info.companyName}${info.companyTagline ? ` - ${info.companyTagline}` : ''}`
    : 'Five-Star Finds - Top Rated. Always.';
  
  const description = info.heroDescription || info.companyTagline || 
    'Discover top-rated products at Five-Star Finds. Curated selection of premium items with worldwide shipping.';
  
  return {
    title,
    description,
    robots: {
      index: false, // TEMPORARY: Block indexing while site is under construction
      follow: false, // TEMPORARY: Block following links while site is under construction
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: 'https://www.fivestarfinds.com',
    },
    alternates: {
      canonical: 'https://www.fivestarfinds.com',
    },
  };
}

export default function FiveStarFindsLayout({ children }) {
  // 🔍 FIVESTARFINDS LAYOUT COMPONENT - Set breakpoint here in Cursor
  return (
    <StorefrontProvider>
      {children}
    </StorefrontProvider>
  );
}

