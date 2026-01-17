/**
 * LEATHER LAYOUT (app/LEATHER/layout.js)
 * 
 * This is the LEATHER storefront-specific layout component.
 * It wraps all pages under /LEATHER and applies the LEATHER theme.
 * 
 * IMPORTANT: This layout is nested inside the root layout (app/layout.js).
 * Execution order: middleware.js → app/layout.js → app/LEATHER/layout.js → app/LEATHER/page.js
 * 
 * The root layout already provides:
 * - <html> and <body> tags
 * - Fonts (Geist, Geist_Mono, Inter)
 * - StorefrontProvider
 * - CookieConsent
 * 
 * This layout only needs to:
 * - Import LEATHER theme CSS (brown/tan theme)
 * - Generate LEATHER-specific metadata
 * - Wrap children (theme CSS will automatically apply)
 */

// Import LEATHER theme CSS (brown/tan theme)
// This overrides the default theme colors from app/globals.css
import "./globals.css";
import { getServerSideInfo } from '@/lib/firestore-server';

/**
 * METADATA (SEO & Browser Information)
 * 
 * LEATHER storefront metadata is generated dynamically from the LEATHER Info document.
 */
export async function generateMetadata() {
  const storefront = 'LEATHER';
  const info = await getServerSideInfo('en', storefront);
  
  // Generate metadata from Info document
  const title = info.companyName 
    ? `${info.companyName}${info.companyTagline ? ` - ${info.companyTagline}` : ''}`
    : 'Leather - Old School Clothes & Accessories for Men';
  
  const description = info.heroDescription || info.companyTagline || 
    'Discover premium leather products for men. From leather jackets to wallets, find timeless old school style and quality craftsmanship.';
  
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
      url: 'https://www.blerinas.com/LEATHER',
    },
    alternates: {
      canonical: 'https://www.blerinas.com/LEATHER',
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
 * LEATHER LAYOUT COMPONENT
 * 
 * This component wraps all pages under /LEATHER.
 * It applies the LEATHER theme (brown/tan) via the imported globals.css.
 * 
 * Note: This is nested inside the root layout (app/layout.js), so it inherits:
 * - <html> and <body> tags from root layout
 * - Fonts and global styles from root layout
 * - But overrides theme colors via app/LEATHER/globals.css
 * 
 * The root layout already includes StorefrontProvider and CookieConsent,
 * so we don't need to duplicate them here. We just need to wrap children.
 */
export default function LeatherLayout({ children }) {
  // 🔍 LEATHER LAYOUT - Set breakpoint here in Cursor
  // LEATHER storefront layout with brown/tan theme
  // Theme colors are applied via app/LEATHER/globals.css
  
  return (
    <>
      {children}
    </>
  );
}

