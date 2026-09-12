'use client';

// NOTE: We no longer use localStorage for storefront cache because:
// 1. localStorage is shared across ALL tabs, causing conflicts when multiple storefronts are open
// 2. Cookies are set per-tab by middleware, providing proper isolation
// 3. Each tab should rely on its own cookie (set by middleware) as the source of truth

import { pathSegmentToStorefront, LUNERA_URL_SLUG } from '@/lib/storefront-paths';

let cachedStorefront = null;
let cacheInitialized = false;

export function saveStorefrontToCache(storefront) {
  if (typeof window === 'undefined') return;
  cachedStorefront = storefront;
  cacheInitialized = true;
}

function getStorefrontFromCache() {
  return cachedStorefront;
}

/**
 * Get current storefront from cookie (set by middleware) or URL path
 * @returns {string} Storefront code (default: 'LUNERA')
 */
export function getStorefront() {
  if (typeof window === 'undefined') {
    return 'LUNERA';
  }

  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const storefrontCookie = cookies.find(c => c.startsWith('storefront='));

    if (storefrontCookie) {
      const storefront = storefrontCookie.split('=')[1];
      if (storefront) {
        cachedStorefront = storefront;
        cacheInitialized = true;
        saveStorefrontToCache(storefront);
        return storefront;
      }
    }
  }

  const cached = getStorefrontFromCache();
  if (cached && !cacheInitialized) {
    cachedStorefront = cached;
    cacheInitialized = true;
    return cached;
  }

  const pathname = window.location.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart', 'orders', 'checkout'];

  let storefront = 'LUNERA';

  if (pathname === '/cart' || pathname.startsWith('/cart/')) {
    const fromCache = getStorefrontFromCache();
    if (fromCache) storefront = fromCache;
  } else if (segments.length === 0 || pathname === '/') {
    storefront = 'LUNERA';
  } else if (!excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = pathSegmentToStorefront(segments[0]) || 'LUNERA';
  }

  cachedStorefront = storefront;
  cacheInitialized = true;
  saveStorefrontToCache(storefront);

  return storefront;
}

export function getStorefrontFromCookie() {
  return getStorefront();
}

export function clearStorefrontCache() {
  cachedStorefront = null;
  cacheInitialized = false;
}
