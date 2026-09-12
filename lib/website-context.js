'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { getFirebaseDb } from '@/lib/firebase';
import { getDocs, collection } from 'firebase/firestore';
import { pathSegmentToStorefront } from '@/lib/storefront-paths';

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

  // Detect website from URL path (e.g., /luneralingerie/... -> LUNERA)
  const detectWebsiteFromUrl = useCallback(() => {
    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0 && pathSegments[0] === 'admin') {
      return null;
    }
    if (pathSegments.length > 0) {
      return pathSegmentToStorefront(pathSegments[0]) || pathSegments[0].toUpperCase();
    }
    return null;
  }, [pathname]);

  // Fetch available websites from Firestore root collections
  const refreshWebsites = useCallback(async () => {
    try {
      const response = await fetch('/api/storefronts');
      if (!response.ok) {
        throw new Error('Failed to fetch storefronts');
      }
      
      const data = await response.json();
      const storefronts = data.storefronts || ['LUNERA'];
      
      setAvailableWebsites(storefronts);
    } catch (error) {
      console.error('Failed to fetch websites:', error);
      setAvailableWebsites(['LUNERA']);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize: detect from URL, then load from localStorage, then fetch available websites
  useEffect(() => {
    const urlWebsite = detectWebsiteFromUrl();
    
    const storedWebsite = typeof window !== 'undefined' 
      ? localStorage.getItem('selectedWebsite') 
      : null;
    
    const initialWebsite = urlWebsite || storedWebsite || 'LUNERA';
    setSelectedWebsiteState(initialWebsite);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedWebsite', initialWebsite);
    }

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

