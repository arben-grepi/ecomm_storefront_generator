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
  const storefront = typeof window !== 'undefined' ? getStorefront() : 'LUNERA';

  useEffect(() => {
    if (storefront && typeof window !== 'undefined') {
      saveStorefrontToCache(storefront);
    }
  }, [storefront, pathname]);

  return (
    <StorefrontContext.Provider value={{ storefront }}>
      {children}
    </StorefrontContext.Provider>
  );
}

/**
 * Hook to get the current storefront from context
 */
export function useStorefront() {
  const context = useContext(StorefrontContext);

  if (!context && typeof window !== 'undefined') {
    return getStorefront();
  }

  return context?.storefront || 'LUNERA';
}
