'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getStorefront, saveStorefrontToCache } from './get-storefront';

const StorefrontContext = createContext({
  storefront: 'LUNERA',
});

/**
 * Provider component that provides storefront context to all children
 * Uses caching to avoid repeated calculations
 */
export function StorefrontProvider({ children }) {
  const pathname = usePathname();
  
  // Calculate storefront immediately (client-side only)
  // This ensures consistent values and avoids hydration mismatches
  const storefront = typeof window !== 'undefined' ? getStorefront() : 'LUNERA';
  
  // Save storefront to localStorage cache whenever it changes
  // This ensures we can navigate back correctly from pages like /cart
  // and updates cache on every page refresh
  useEffect(() => {
    if (storefront && typeof window !== 'undefined') {
      // Always save to cache - this updates the cache on every refresh
      // and when switching between storefronts
      saveStorefrontToCache(storefront);
    }
  }, [storefront]);
  
  return (
    <StorefrontContext.Provider value={{ storefront }}>
      {children}
    </StorefrontContext.Provider>
  );
}

/**
 * Hook to get the current storefront from context
 * Falls back to direct calculation if context not available
 */
export function useStorefront() {
  const context = useContext(StorefrontContext);
  
  // If context is not available (provider not in tree), fall back to direct calculation
  // Only do this on client-side to avoid hydration mismatches
  if (!context && typeof window !== 'undefined') {
    // Double-check by calculating directly (context might not be initialized)
    const calculated = getStorefront();
    return calculated;
  }
  
  // Return context value (will be 'LUNERA' default if context not available on server)
  return context?.storefront || 'LUNERA';
}

