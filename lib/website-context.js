'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { getFirebaseDb } from '@/lib/firebase';
import { getDocs, collection } from 'firebase/firestore';

const WebsiteContext = createContext({
  selectedWebsite: 'LUNERA',
  availableWebsites: ['LUNERA'],
  loading: true,
  setSelectedWebsite: () => {},
  refreshWebsites: () => {},
});

export function WebsiteProvider({ children }) {
  const pathname = usePathname();
  const [selectedWebsite, setSelectedWebsiteState] = useState('LUNERA');
  const [availableWebsites, setAvailableWebsites] = useState(['LUNERA']);
  const [loading, setLoading] = useState(true);

  // Detect website from URL path (e.g., /LUNERA/... -> LUNERA, but not for /admin routes)
  const detectWebsiteFromUrl = useCallback(() => {
    const pathSegments = pathname.split('/').filter(Boolean);
    // For admin routes (/admin/...), don't detect from URL - use localStorage/default
    if (pathSegments.length > 0 && pathSegments[0] === 'admin') {
      return null;
    }
    // First segment after root should be the website name (for storefront routes)
    if (pathSegments.length > 0) {
      return pathSegments[0].toUpperCase();
    }
    return null;
  }, [pathname]);

  // Fetch available websites from Firestore root collections
  // Uses API route to query all root-level collections (excluding shopifyItems, carts, etc.)
  const refreshWebsites = useCallback(async () => {
    try {
      // Call API route that uses Admin SDK to list collections
      const response = await fetch('/api/storefronts');
      if (!response.ok) {
        throw new Error('Failed to fetch storefronts');
      }
      
      const data = await response.json();
      const storefronts = data.storefronts || ['LUNERA'];
      
      setAvailableWebsites(storefronts);
    } catch (error) {
      console.error('Failed to fetch websites:', error);
      setAvailableWebsites(['LUNERA']); // Fallback to default
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize: detect from URL, then load from localStorage, then fetch available websites
  useEffect(() => {
    const urlWebsite = detectWebsiteFromUrl();
    
    // Priority: URL > localStorage > default
    const storedWebsite = typeof window !== 'undefined' 
      ? localStorage.getItem('selectedWebsite') 
      : null;
    
    const initialWebsite = urlWebsite || storedWebsite || 'LUNERA';
    setSelectedWebsiteState(initialWebsite);
    
    // Store in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedWebsite', initialWebsite);
    }

    // Fetch available websites
    refreshWebsites();
  }, [detectWebsiteFromUrl, refreshWebsites]);

  // Update selected website
  const setSelectedWebsite = useCallback((website) => {
    setSelectedWebsiteState(website);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedWebsite', website);
    }
  }, []);

  // Update when URL changes
  useEffect(() => {
    const urlWebsite = detectWebsiteFromUrl();
    if (urlWebsite && urlWebsite !== selectedWebsite && availableWebsites.includes(urlWebsite)) {
      setSelectedWebsite(urlWebsite);
    }
  }, [pathname, detectWebsiteFromUrl, selectedWebsite, availableWebsites, setSelectedWebsite]);

  return (
    <WebsiteContext.Provider
      value={{
        selectedWebsite,
        availableWebsites,
        loading,
        setSelectedWebsite,
        refreshWebsites,
      }}
    >
      {children}
    </WebsiteContext.Provider>
  );
}

export function useWebsite() {
  const context = useContext(WebsiteContext);
  if (!context) {
    throw new Error('useWebsite must be used within WebsiteProvider');
  }
  return context;
}

