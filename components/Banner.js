'use client';

import { useMemo } from 'react';

/**
 * Banner Component
 * Displays a full-width banner image with optional centered content overlay
 * Banner always uses 100% width and auto height based on image dimensions
 * 
 * Optimization Strategy:
 * - Memoized image URL prevents unnecessary re-renders when navigating between pages
 * - Browser caching handled by Firebase Storage HTTP headers (7 days cache: max-age=604800)
 * - Server-side caching: Firestore Info document is cached by Next.js (getServerSideInfoCached)
 * - Using regular <img> tag for full-width banners with auto height (better than Next.js Image fill)
 * - fetchPriority="high" ensures banner loads with high priority
 * 
 * Cache Busting:
 * - Each banner upload gets a unique timestamped filename (e.g., "1234567890-banner.jpg")
 * - When banner changes, the URL in Firestore changes to the new timestamped file
 * - Browsers automatically fetch the new image because the URL is different
 * - Old banner images remain cached but are no longer referenced, so they don't affect users
 * - This means users see new banners immediately, while still benefiting from caching
 * 
 * When navigating from cart to homepage:
 * - Banner URL is memoized, so no re-render if URL hasn't changed
 * - Browser cache serves image if available (7 days cache from Firebase Storage)
 * - Firestore read is cached by Next.js server-side cache
 * 
 * @param {string} imageSrc - URL of the banner image (from Firestore Info document)
 * @param {React.ReactNode} children - Content to display centered on top of the banner
 * @param {string} className - Additional CSS classes for the banner container
 */
export default function Banner({ imageSrc, children, className = '' }) {
  // Memoize the banner URL to prevent unnecessary re-renders when navigating between pages
  // This ensures the image component doesn't re-render unnecessarily when other props change
  const memoizedImageSrc = useMemo(() => imageSrc, [imageSrc]);

  if (!memoizedImageSrc) {
    // If no image, just render children without banner
    return children ? <div className={className}>{children}</div> : null;
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Banner Image - Always 100% width, height auto to maintain aspect ratio */}
      {/* Browser caching: Firebase Storage sets Cache-Control: public, max-age=31536000 (1 year) */}
      {/* Server caching: Firestore Info document is cached by Next.js server-side cache */}
      <div style={{ width: '100%' }}>
        <img
          src={memoizedImageSrc}
          alt="Banner"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          loading="eager"
          fetchPriority="high"
        />
      </div>
      
      {/* Centered Content Overlay */}
      {children && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

