'use client';

const STOREFRONT_STORAGE_KEY = 'ecommerce_storefront';

// Simple in-memory cache (per session)
let cachedStorefront = null;
let cacheInitialized = false;

/**
 * Save storefront to localStorage (persistent across sessions)
 * @param {string} storefront - Storefront code to save
 */
export function saveStorefrontToCache(storefront) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STOREFRONT_STORAGE_KEY, storefront);
    // Also update in-memory cache
    cachedStorefront = storefront;
    cacheInitialized = true;
  } catch (error) {
    console.warn('Failed to save storefront to localStorage:', error);
  }
}

/**
 * Get storefront from localStorage cache
 * @returns {string|null} Cached storefront or null
 */
function getStorefrontFromCache() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STOREFRONT_STORAGE_KEY);
  } catch {
    return null;
  }
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
  
  // Always check cookie first (set by middleware - most reliable source)
  // Don't use in-memory cache to skip checking - we want to update cache on every refresh
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const storefrontCookie = cookies.find(c => c.startsWith('storefront='));
    
    if (storefrontCookie) {
      const storefront = storefrontCookie.split('=')[1];
      if (storefront) {
        cachedStorefront = storefront;
        cacheInitialized = true;
        // Always save to localStorage for persistence (updates cache on every refresh)
        saveStorefrontToCache(storefront);
        return storefront;
      }
    }
  }
  
  // Try localStorage cache (persistent across page reloads)
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
    // On cart page, use cached storefront or default
    const cached = getStorefrontFromCache();
    if (cached) {
      storefront = cached;
    }
  } else if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = segments[0].toUpperCase();
  }
  
  // Cache the result (both in-memory and localStorage)
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

