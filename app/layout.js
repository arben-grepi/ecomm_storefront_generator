/**
 * ROOT LAYOUT (app/layout.js)
 * 
 * This is the top-level layout component that wraps ALL pages in your Next.js app.
 * It runs on the SERVER (Node.js runtime), so you CAN debug it with breakpoints.
 * 
 * IMPORTANT: This file is executed for EVERY page request, before any route-specific layouts.
 * Execution order: middleware.js → app/layout.js → app/page.js (LUNERA storefront at root)
 */

import { Geist, Geist_Mono, Inter } from "next/font/google";
// Import shared global CSS (common styles for all pages)
// Root uses LUNERA theme (pink) as default
// Other storefronts import their own theme CSS in their layouts:
// - app/FIVESTARFINDS/layout.js imports app/FIVESTARFINDS/globals.css (turquoise theme)
import "./globals.css";
// PageTransitionBar removed - wasn't working/visible. Can be re-added if needed.
import CookieConsent from "@/components/CookieConsent";
import GoogleFontsLoader from "@/components/GoogleFontsLoader";
import { StorefrontProvider } from '@/lib/storefront-context';
import { getServerSideInfo } from '@/lib/firestore-server';

/**
 * FONT LOADING (Next.js Font Optimization)
 * 
 * Next.js automatically optimizes Google Fonts by:
 * 1. Downloading fonts at build time (not runtime)
 * 2. Self-hosting them (no external requests)
 * 3. Generating CSS variables for easy use
 * 
 * The `variable` property creates a CSS variable (e.g., --font-geist-sans)
 * that you can use in your CSS files or Tailwind config.
 * 
 * These fonts are loaded ONCE and cached, improving performance.
 */
const geistSans = Geist({
  variable: "--font-geist-sans", // Creates CSS variable: var(--font-geist-sans)
  subsets: ["latin"], // Only load Latin characters (smaller file size)
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono", // Creates CSS variable: var(--font-geist-mono)
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter", // Creates CSS variable: var(--font-inter)
  subsets: ["latin"],
});
/**
 * METADATA (SEO & Browser Information)
 * 
 * Root layout now serves LUNERA as the default storefront.
 * Metadata is generated dynamically from the LUNERA Info document.
 */
export async function generateMetadata() {
  const storefront = 'LUNERA';
  const info = await getServerSideInfo('en', storefront);
  
  // Generate metadata from Info document
  const title = info.companyTagline;
  
  const description = info.heroMainHeading + ' - ' + info.heroDescription;

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
      url: 'https://www.blerinas.com',
    },
    alternates: {
      canonical: 'https://www.blerinas.com',
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
 * ROOT LAYOUT COMPONENT
 * 
 * This component wraps ALL pages in your application.
 * It's like a shell that every page sits inside.
 * 
 * The {children} prop contains the actual page content (e.g., Home, Category, Product pages).
 * 
 * This runs on the SERVER, so you CAN set breakpoints here and debug it.
 */
export default function RootLayout({ children }) {
  // 🔍 ROOT LAYOUT - Set breakpoint here in Cursor (Node.js debugger will work)
  // Root layout now serves LUNERA as the default storefront
  
  return (
    <html lang="en" data-scroll-behavior="smooth">
      {/* 
        className applies the font CSS variables to the <body> tag
        This makes the fonts available to all child components via CSS variables
        
        The variables are defined in the font objects above (--font-geist-sans, etc.)
        and can be used in CSS like: font-family: var(--font-geist-sans);
        
        antialiased: Tailwind class that makes text look smoother
      */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        <StorefrontProvider>
          {/* 
            {children} is where the actual page content gets rendered
          */}
          {children}
          
          {/* 
            Cookie Consent Banner - appears at bottom until user gives consent
          */}
          <CookieConsent />
          
          {/* 
            Google Fonts Loader - loads fonts for font selector preview
          */}
          <GoogleFontsLoader />
        </StorefrontProvider>
      </body>
    </html>
  );
}


