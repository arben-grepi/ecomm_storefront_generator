import { StorefrontProvider } from '@/lib/storefront-context';
import { getServerSideInfo } from '@/lib/firestore-server';
import './globals.css'; // Import LUNERA's theme-specific CSS (pink colors)

// TEMPORARY: Site is under construction - blocking search engine indexing until site is finished
// TODO: Change robots to { index: true, follow: true } once site is ready for production
export async function generateMetadata() {
  // 🔍 LUNERA LAYOUT METADATA - Set breakpoint here in Cursor
  const storefront = 'LUNERA';
  const info = await getServerSideInfo('en', storefront);
  
  // Generate metadata from Info document
  const title = info.companyName 
    ? `${info.companyName}${info.companyTagline ? ` - ${info.companyTagline}` : ''}`
    : 'Blerinas - Premium Fashion & Accessories';
  
  const description = info.heroDescription || info.companyTagline || 
    'Discover premium fashion and accessories at Blerinas. Shop the latest collections with worldwide shipping.';
  
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
      url: 'https://www.blerinas.com',
    },
    alternates: {
      canonical: 'https://www.blerinas.com',
    },
  };
}

export default function LuneraLayout({ children }) {
  // 🔍 LUNERA LAYOUT COMPONENT - Set breakpoint here in Cursor
  return (
    <StorefrontProvider>
      {children}
    </StorefrontProvider>
  );
}
