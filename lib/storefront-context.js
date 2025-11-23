'use client';

import { createContext, useContext, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { getStorefront } from './get-storefront';

const StorefrontContext = createContext({
  storefront: 'LUNERA',
});

/**
 * Provider component that provides storefront context to all children
 * Uses caching to avoid repeated calculations
 */
export function StorefrontProvider({ children }) {
  const pathname = usePathname();
  
  // Memoize storefront calculation - only recalculate if pathname changes
  const storefront = useMemo(() => {
    return getStorefront();
  }, [pathname]);
  
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
  if (!context || context.storefront === 'LUNERA' && typeof window !== 'undefined') {
    // Double-check by calculating directly (context might not be initialized)
    const calculated = getStorefront();
    return calculated;
  }
  
  return context.storefront;
}

