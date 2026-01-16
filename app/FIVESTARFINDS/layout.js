/**
 * FIVESTARFINDS LAYOUT (app/FIVESTARFINDS/layout.js)
 * 
 * This is the FIVESTARFINDS storefront-specific layout component.
 * It wraps all pages under /FIVESTARFINDS and applies the FIVESTARFINDS theme.
 * 
 * IMPORTANT: This layout is nested inside the root layout (app/layout.js).
 * Execution order: middleware.js → app/layout.js → app/FIVESTARFINDS/layout.js → app/FIVESTARFINDS/page.js
 * 
 * The root layout already provides:
 * - <html> and <body> tags
 * - Fonts (Geist, Geist_Mono, Inter)
 * - StorefrontProvider
 * - CookieConsent
 * 
 * This layout only needs to:
 * - Import FIVESTARFINDS theme CSS (turquoise theme)
 * - Generate FIVESTARFINDS-specific metadata
 * - Wrap children (theme CSS will automatically apply)
 */

// Import FIVESTARFINDS theme CSS (turquoise theme)
// This overrides the default theme colors from app/globals.css
import "./globals.css";
import { getServerSideInfo } from '@/lib/firestore-server';

/**
 * METADATA (SEO & Browser Information)
 * 
 * FIVESTARFINDS storefront metadata is generated dynamically from the FIVESTARFINDS Info document.
 */
export async function generateMetadata() {
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
      index: true,
      follow: true,
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
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/favicon.ico', sizes: 'any' },
      ],
    },
  };
}

/**
 * FIVESTARFINDS LAYOUT COMPONENT
 * 
 * This component wraps all pages under /FIVESTARFINDS.
 * It applies the FIVESTARFINDS theme (turquoise) via the imported globals.css.
 * 
 * Note: This is nested inside the root layout (app/layout.js), so it inherits:
 * - <html> and <body> tags from root layout
 * - Fonts and global styles from root layout
 * - But overrides theme colors via app/FIVESTARFINDS/globals.css
 * 
 * The root layout already includes StorefrontProvider and CookieConsent,
 * so we don't need to duplicate them here. We just need to wrap children.
 */
export default function FiveStarFindsLayout({ children }) {
  // 🔍 FIVESTARFINDS LAYOUT - Set breakpoint here in Cursor
  // FIVESTARFINDS storefront layout with turquoise theme
  // Theme colors are applied via app/FIVESTARFINDS/globals.css
  
  return (
    <>
      {children}
    </>
  );
}

