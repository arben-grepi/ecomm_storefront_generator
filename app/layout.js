/**
 * ROOT LAYOUT (app/layout.js)
 * 
 * This is the top-level layout component that wraps ALL pages in your Next.js app.
 * It runs on the SERVER (Node.js runtime), so you CAN debug it with breakpoints.
 * 
 * IMPORTANT: This file is executed for EVERY page request, before any route-specific layouts.
 * Execution order: middleware.js → app/layout.js → app/{storefront}/page.js
 * Root (/) redirects to /luneralingerie via middleware (LUNERA).
 */

import { Geist, Geist_Mono, Inter } from "next/font/google";
// Import shared global CSS (common styles for all pages)
// Default theme colors are fallbacks only (actual colors come from Firestore Info documents).
// Storefronts import their own theme CSS in their layouts:
// - app/luneralingerie/layout.js imports app/luneralingerie/globals.css
import "./globals.css";
// PageTransitionBar removed - wasn't working/visible. Can be re-added if needed.
import { cookies } from 'next/headers';
import CookieConsent from "@/components/CookieConsent";
import GoogleFontsLoader from "@/components/GoogleFontsLoader";
import { StorefrontProvider } from '@/lib/storefront-context';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { resolveLanguage } from '@/lib/i18n/resolve-language';
import { loadMessages } from '@/lib/i18n/load-messages';
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
 * Root layout metadata uses LUNERA as the default storefront.
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
export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const market = cookieStore.get('market')?.value || 'XK';
  const language = resolveLanguage(
    cookieStore.get('language')?.value,
    market
  );
  const messages = await loadMessages(language);

  return (
    <html lang={language} data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        <StorefrontProvider>
          <LanguageProvider
            initialLanguage={language}
            initialMessages={messages}
            initialMarket={market}
          >
            {children}
            <CookieConsent />
            <GoogleFontsLoader />
          </LanguageProvider>
        </StorefrontProvider>
      </body>
    </html>
  );
}


