/**
 * ROOT LAYOUT (app/layout.js)
 * 
 * This is the top-level layout component that wraps ALL pages in your Next.js app.
 * It runs on the SERVER (Node.js runtime), so you CAN debug it with breakpoints.
 * 
 * IMPORTANT: This file is executed for EVERY page request, before any route-specific layouts.
 * Execution order: middleware.js → app/layout.js → app/LUNERA/layout.js → app/LUNERA/page.js
 */

import { Geist, Geist_Mono, Inter } from "next/font/google";
// Import shared global CSS (common styles for all pages)
// Storefront-specific theme colors are imported in each storefront's layout:
// - app/LUNERA/layout.js imports app/LUNERA/globals.css (pink theme)
// - app/FIVESTARFINDS/layout.js imports app/FIVESTARFINDS/globals.css (turquoise theme)
import "./globals.css";
// PageTransitionBar removed - wasn't working/visible. Can be re-added if needed.
import UnderConstructionBanner from "@/components/UnderConstructionBanner";

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
 * This object defines HTML <head> tags that are used by:
 * 1. Search engines (Google, Bing) - for SEO (Search Engine Optimization)
 * 2. Social media platforms (Facebook, Twitter) - when sharing links
 * 3. Browsers - for bookmarks, tabs, and history
 * 
 * This root metadata defaults to FIVESTARFINDS since it's the main storefront.
 * Admin routes have their own metadata in app/admin/layout.js.
 */
export const metadata = {
  // Default to FIVESTARFINDS (main storefront) - trending, highly-rated, top-selling products
  title: "Five-Star Finds - Top Rated. Always.",
  description: "Discover top-rated products at Five-Star Finds. Curated selection of trending, highly-rated, top-selling products people need with worldwide shipping.",
  
  // Note: robots meta tag is handled per-route in storefront layouts
  // Storefront routes (e.g., /LUNERA/*) should allow indexing
  // Admin routes should block indexing (handled in admin layout)

  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' }, // Modern SVG favicon (scalable)
      { url: '/favicon.ico', sizes: 'any' }, // Fallback for older browsers
    ],
   
  },
};

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
  
  return (
    <html lang="en">
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
        {/* 
          Global components that appear on every page:
          - UnderConstructionBanner: Shows "under construction" message (if enabled)
        */}
        <UnderConstructionBanner />
        
        {/* 
          {children} is where the actual page content gets rendered
        */}
        {children}
      </body>
    </html>
  );
}


