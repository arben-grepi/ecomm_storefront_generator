/**
 * HEALTH LAYOUT (app/HEALTH/layout.js)
 * 
 * This is the HEALTH storefront-specific layout component.
 * It wraps all pages under /HEALTH and applies the HEALTH theme.
 * 
 * IMPORTANT: This layout is nested inside the root layout (app/layout.js).
 * Execution order: middleware.js → app/layout.js → app/HEALTH/layout.js → app/HEALTH/page.js
 * 
 * The root layout already provides:
 * - <html> and <body> tags
 * - Fonts (Geist, Geist_Mono, Inter)
 * - StorefrontProvider
 * - CookieConsent
 * 
 * This layout only needs to:
 * - Import HEALTH theme CSS (green theme)
 * - Generate HEALTH-specific metadata
 * - Wrap children (theme CSS will automatically apply)
 */

// Import HEALTH theme CSS (green theme)
// This overrides the default theme colors from app/globals.css
import "./globals.css";
import { getServerSideInfo } from '@/lib/firestore-server';

/**
 * METADATA (SEO & Browser Information)
 * 
 * HEALTH storefront metadata is generated dynamically from the HEALTH Info document.
 */
export async function generateMetadata() {
  const storefront = 'HEALTH';
  const info = await getServerSideInfo('en', storefront);
  
  // Generate metadata from Info document
  const title = info.companyName 
    ? `${info.companyName}${info.companyTagline ? ` - ${info.companyTagline}` : ''}`
    : 'Health - Your Wellness Destination';
  
  const description = info.heroDescription || info.companyTagline || 
    'Discover premium health and wellness products. Curated selection for your healthy lifestyle.';
  
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
      url: 'https://www.health.com',
    },
    alternates: {
      canonical: 'https://www.health.com',
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
 * HEALTH LAYOUT COMPONENT
 * 
 * This component wraps all pages under /HEALTH.
 * It applies the HEALTH theme (green) via the imported globals.css.
 * 
 * Note: This is nested inside the root layout (app/layout.js), so it inherits:
 * - <html> and <body> tags from root layout
 * - Fonts and global styles from root layout
 * - But overrides theme colors via app/HEALTH/globals.css
 * 
 * The root layout already includes StorefrontProvider and CookieConsent,
 * so we don't need to duplicate them here. We just need to wrap children.
 */
export default function HealthLayout({ children }) {
  // 🔍 HEALTH LAYOUT - Set breakpoint here in Cursor
  // HEALTH storefront layout with green theme
  // Theme colors are applied via app/HEALTH/globals.css
  
  return (
    <>
      {children}
    </>
  );
}

