/**
 * Logo Cache - Simplified logo storage in session memory
 * 
 * Stores the calculated logo path in sessionStorage when storefront loads.
 * All components can use this cached logo instead of recalculating.
 * 
 * Logic:
 * 1. When storefront loads (HomeClient or middleware), calculate logo and store it
 * 2. All components read from this cache (single source of truth)
 * 3. Cache is per storefront and updates when storefront changes
 */

const LOGO_CACHE_KEY = 'ecommerce_storefront_logo';
const LOGO_CACHE_STOREFRONT_KEY = 'ecommerce_storefront_logo_storefront';

/**
 * Get cached logo path for current storefront
 * Returns null if not cached or storefront changed
 * @returns {string|null} Logo path or null
 */
export function getCachedLogo() {
  if (typeof window === 'undefined') return null;
  
  try {
    const cachedLogo = sessionStorage.getItem(LOGO_CACHE_KEY);
    const cachedStorefront = sessionStorage.getItem(LOGO_CACHE_STOREFRONT_KEY);
    
    // Return cached logo if storefront matches
    if (cachedLogo && cachedStorefront) {
      // Verify storefront hasn't changed (in case user navigated between storefronts)
      const { getStorefront } = require('@/lib/get-storefront');
      const currentStorefront = getStorefront();
      
      if (currentStorefront === cachedStorefront) {
        return cachedLogo;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('[LogoCache] Failed to get cached logo:', error);
    return null;
  }
}

/**
 * Save logo path to cache for current storefront
 * @param {string} storefront - Storefront code (e.g., 'LUNERA')
 * @param {string} logoPath - Logo path to cache
 */
export function saveLogoToCache(storefront, logoPath) {
  if (typeof window === 'undefined' || !storefront || !logoPath) return;
  
  try {
    sessionStorage.setItem(LOGO_CACHE_KEY, logoPath);
    sessionStorage.setItem(LOGO_CACHE_STOREFRONT_KEY, storefront);
  } catch (error) {
    console.warn('[LogoCache] Failed to save logo to cache:', error);
  }
}

/**
 * Clear cached logo (when storefront changes or on logout)
 */
export function clearLogoCache() {
  if (typeof window === 'undefined') return;
  
  try {
    sessionStorage.removeItem(LOGO_CACHE_KEY);
    sessionStorage.removeItem(LOGO_CACHE_STOREFRONT_KEY);
  } catch (error) {
    console.warn('[LogoCache] Failed to clear logo cache:', error);
  }
}

/**
 * Get logo path - tries cache first, falls back to calculation
 * This is the main function components should use
 * @param {string} storefront - Storefront code
 * @param {object} info - Optional Info document from Firestore
 * @returns {string} Logo path
 */
export function getLogo(storefront, info = null) {
  // Try cache first
  const cachedLogo = getCachedLogo();
  if (cachedLogo) {
    return cachedLogo;
  }
  
  // Fall back to calculation if not cached
  const { getStorefrontLogo } = require('@/lib/storefront-logos');
  const logoPath = getStorefrontLogo(storefront, info);
  
  // Cache it for next time
  if (logoPath && storefront) {
    saveLogoToCache(storefront, logoPath);
  }
  
  return logoPath;
}

