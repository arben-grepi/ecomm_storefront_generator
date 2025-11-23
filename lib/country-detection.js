/**
 * Country Detection Utilities
 * 
 * Detects user's country for market-specific inventory display.
 * Supports multiple methods: IP geolocation, session storage, market selector, or default fallback.
 */

const DEFAULT_COUNTRY = 'FI'; // Finland - primary market

/**
 * Get user's country code
 * Tries multiple methods in order of preference:
 * 1. Market selector (user selection)
 * 2. Session storage (previously detected)
 * 3. IP geolocation (automatic)
 * 4. Default fallback (FI)
 * 
 * @param {Object} options - Detection options
 * @param {string} options.fromSelector - Country from market selector UI
 * @param {string} options.fromSession - Country from session storage
 * @param {string} options.fromCheckout - Country from checkout address
 * @returns {string} ISO 2-letter country code
 */
export function detectUserCountry(options = {}) {
  // Priority 1: Explicit selection (market selector or checkout address)
  if (options.fromSelector) {
    return options.fromSelector.toUpperCase();
  }
  
  if (options.fromCheckout) {
    return options.fromCheckout.toUpperCase();
  }

  // Priority 2: Session storage (previously detected)
  if (typeof window !== 'undefined' && options.fromSession) {
    try {
      const stored = sessionStorage.getItem('user_country') || localStorage.getItem('user_country');
      if (stored && stored.length === 2) {
        return stored.toUpperCase();
      }
    } catch (e) {
      // Session storage not available, continue
    }
  }

  // Priority 3: IP geolocation (async, would need API call)
  // This would require a geolocation service (e.g., Vercel Edge, Cloudflare, etc.)
  // For now, we'll use default

  // Priority 4: Default fallback
  return DEFAULT_COUNTRY;
}

/**
 * Store user's country in session/localStorage
 * @param {string} countryCode - ISO 2-letter country code
 */
export function storeUserCountry(countryCode) {
  if (typeof window === 'undefined') return;
  
  try {
    sessionStorage.setItem('user_country', countryCode.toUpperCase());
    localStorage.setItem('user_country', countryCode.toUpperCase()); // Persist across sessions
  } catch (e) {
    console.warn('Could not store user country:', e);
  }
}

/**
 * Get country from checkout address
 * @param {Object} address - Shipping address object
 * @returns {string|null} ISO 2-letter country code or null
 */
export function getCountryFromAddress(address) {
  if (!address) return null;
  
  return (address.countryCode || address.country || null)?.toUpperCase();
}

/**
 * React hook for country detection
 * Only use this in client-side React components
 * Import this in your component file: import { useUserCountry } from '@/lib/country-detection'
 * 
 * Usage:
 *   const { country, setCountry } = useUserCountry();
 * 
 * @returns {Object} { country, setCountry, loading }
 */
// Note: This hook should be defined in a separate client component file
// to avoid SSR issues. For now, we'll provide a simpler version that
// can be used in client components that import React hooks directly.

