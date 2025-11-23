'use client';

// Simple in-memory cache (per session)
let cachedStorefront = null;
let cacheInitialized = false;

/**
 * Get current storefront from cookie (set by middleware) or URL path
 * Uses caching to avoid repeated calculations
 * Examples:
 * - /LUNERA/... → 'LUNERA'
 * - /giftshop/... → 'GIFTSHOP'
 * - /luxury/... → 'LUXURY'
 * - /admin/... → 'LUNERA' (default)
 * 
 * @returns {string} Storefront code (default: 'LUNERA')
 */
export function getStorefront() {
  if (typeof window === 'undefined') {
    // Server-side: use default
    return 'LUNERA';
  }
  
  // Return cached value if available
  if (cacheInitialized && cachedStorefront) {
    return cachedStorefront;
  }
  
  // Try to get from cookie first (set by middleware - most efficient)
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const storefrontCookie = cookies.find(c => c.startsWith('storefront='));
    
    if (storefrontCookie) {
      const storefront = storefrontCookie.split('=')[1];
      if (storefront) {
        cachedStorefront = storefront;
        cacheInitialized = true;
        return storefront;
      }
    }
  }
  
  // Fallback to URL detection (if cookie not set)
  const pathname = window.location.pathname;
  const segments = pathname.split('/').filter(Boolean);
  
  // First segment is storefront (if not 'admin', 'api', etc.)
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next'];
  
  let storefront = 'LUNERA'; // Default
  
  if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = segments[0].toUpperCase();
  }
  
  // Cache the result
  cachedStorefront = storefront;
  cacheInitialized = true;
  
  return storefront;
}

/**
 * Get storefront from cookie (set by middleware)
 * Falls back to URL detection if cookie not set
 * @deprecated Use getStorefront() instead - it now handles cookies automatically
 */
export function getStorefrontFromCookie() {
  return getStorefront();
}

/**
 * Clear the storefront cache (useful when navigating between storefronts)
 */
export function clearStorefrontCache() {
  cachedStorefront = null;
  cacheInitialized = false;
}

