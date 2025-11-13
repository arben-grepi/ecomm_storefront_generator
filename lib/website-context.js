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

  // Detect website from URL path (e.g., /LUNERA/admin/overview -> LUNERA)
  const detectWebsiteFromUrl = useCallback(() => {
    const pathSegments = pathname.split('/').filter(Boolean);
    // First segment after root should be the website name
    if (pathSegments.length > 0 && pathSegments[0] !== 'admin') {
      return pathSegments[0].toUpperCase();
    }
    return null;
  }, [pathname]);

  // Fetch available websites from Firestore root collections
  const refreshWebsites = useCallback(async () => {
    try {
      const db = getFirebaseDb();
      if (!db) {
        console.warn('Firebase DB not available, using default website');
        setAvailableWebsites(['LUNERA']);
        setLoading(false);
        return;
      }

      // Note: Firestore doesn't have a direct way to list root collections
      // We'll need to maintain a list or check for specific collections
      // For now, we'll check for known website collections by trying to read a common document
      // A better approach would be to maintain a "websites" collection with metadata
      
      // Try to detect websites by checking for common collections
      // This is a workaround - ideally you'd have a "websites" collection
      const websites = ['LUNERA']; // Start with known websites
      
      // Try to read from each website's Info document to verify it exists
      const verifiedWebsites = [];
      for (const website of websites) {
        try {
          // Check if Info document exists by trying to read it
          const infoDoc = await getDocs(collection(db, website, 'Info'));
          if (!infoDoc.empty || website === 'LUNERA') {
            // If we can access the collection or it's LUNERA (default), include it
            verifiedWebsites.push(website);
          }
        } catch (error) {
          // Collection might not exist, but include LUNERA as default
          if (website === 'LUNERA') {
            verifiedWebsites.push(website);
          }
          console.debug(`Website ${website} not found or not accessible`);
        }
      }

      // If no websites found, default to LUNERA
      if (verifiedWebsites.length === 0) {
        verifiedWebsites.push('LUNERA');
      }

      setAvailableWebsites(verifiedWebsites);
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

