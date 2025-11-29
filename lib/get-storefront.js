'use client';

// NOTE: We no longer use localStorage for storefront cache because:
// 1. localStorage is shared across ALL tabs, causing conflicts when multiple storefronts are open
// 2. Cookies are set per-tab by middleware, providing proper isolation
// 3. Each tab should rely on its own cookie (set by middleware) as the source of truth

// Simple in-memory cache (per session/tab - isolated per JavaScript context)
let cachedStorefront = null;
let cacheInitialized = false;

/**
 * Save storefront to in-memory cache only (not localStorage)
 * localStorage is shared across tabs, which causes conflicts when multiple storefronts are open.
 * Each tab should rely on its own cookie (set by middleware) as the source of truth.
 * 
 * @param {string} storefront - Storefront code to save
 */
export function saveStorefrontToCache(storefront) {
  if (typeof window === 'undefined') return;
  // Only update in-memory cache (per-tab, isolated)
  // Do NOT use localStorage - it's shared across tabs and causes conflicts
  cachedStorefront = storefront;
  cacheInitialized = true;
}

/**
 * Get storefront from in-memory cache only
 * @returns {string|null} Cached storefront or null
 */
function getStorefrontFromCache() {
  // Only return in-memory cache (per-tab, isolated)
  // Do NOT read from localStorage - it's shared across tabs
  return cachedStorefront;
}

/**
 * Get current storefront from cookie (set by middleware), localStorage cache, or URL path
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
  
  // Always check cookie first (set by middleware - most reliable source, isolated per tab)
  // Don't use in-memory cache to skip checking - we want to update cache on every refresh
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const storefrontCookie = cookies.find(c => c.startsWith('storefront='));
    
    if (storefrontCookie) {
      const storefront = storefrontCookie.split('=')[1];
      if (storefront) {
        cachedStorefront = storefront;
        cacheInitialized = true;
        // Update in-memory cache (per-tab, isolated)
        saveStorefrontToCache(storefront);
        return storefront;
      }
    }
  }
  
  // Try in-memory cache (per-tab, isolated)
  // Only use if cookie is not available (cookie is the source of truth)
  const cached = getStorefrontFromCache();
  if (cached && !cacheInitialized) {
    // Only use cached value if we haven't found a cookie
    // This ensures cookie always takes precedence
    cachedStorefront = cached;
    cacheInitialized = true;
    return cached;
  }
  
  // Fallback to URL detection (if cookie not set)
  const pathname = window.location.pathname;
  const segments = pathname.split('/').filter(Boolean);
  
  // First segment is storefront (if not 'admin', 'api', etc.)
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart'];
  
  let storefront = 'LUNERA'; // Default
  
  // If we're on the cart page, don't try to detect from URL - use cache or default
  if (pathname === '/cart' || pathname.startsWith('/cart/')) {
    // On cart page, use in-memory cached storefront or default
    const cached = getStorefrontFromCache();
    if (cached) {
      storefront = cached;
    }
  } else if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = segments[0].toUpperCase();
  }
  
  // Cache the result (in-memory only - per-tab, isolated)
  cachedStorefront = storefront;
  cacheInitialized = true;
  saveStorefrontToCache(storefront);
  
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

