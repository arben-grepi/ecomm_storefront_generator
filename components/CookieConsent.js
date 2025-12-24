'use client';

import { useState, useEffect } from 'react';
import { useStorefront } from '@/lib/storefront-context';
import { getStorefrontLogo, getStorefrontTheme } from '@/lib/storefront-logos';

const COOKIE_CONSENT_KEY = 'cookie_consent';
const COOKIE_PREFERENCES_KEY = 'cookie_preferences';

// Cookie categories
const COOKIE_CATEGORIES = {
  essential: {
    name: 'Essential Cookies',
    description: 'Required for the website to function. Includes location detection (market/country) and storefront selection.',
    required: true,
    cookies: ['market', 'storefront'],
  },
  analytics: {
    name: 'Analytics Cookies',
    description: 'Help us understand how visitors interact with our website. Includes Google Analytics.',
    required: false,
    cookies: ['_ga', '_ga_*'],
  },
  functional: {
    name: 'Functional Cookies',
    description: 'Enable enhanced functionality like language preferences and cart persistence.',
    required: false,
    cookies: ['language', 'ecommerce_cart'],
  },
};

export default function CookieConsent() {
  const storefront = useStorefront();
  const [info, setInfo] = useState(null);
  
  // Fetch Info document to get logo and primary color
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const { getFirebaseDb } = await import('@/lib/firebase');
        const { getCachedInfo } = await import('@/lib/info-cache');
        const { doc, getDoc } = await import('firebase/firestore');
        
        // Try cache first
        const cachedInfo = getCachedInfo(storefront);
        if (cachedInfo) {
          setInfo(cachedInfo);
          return;
        }
        
        // Fetch from Firestore
        const db = getFirebaseDb();
        if (db) {
          const infoRef = doc(db, storefront, 'Info');
          const infoSnap = await getDoc(infoRef);
          if (infoSnap.exists()) {
            const data = infoSnap.data();
            setInfo(data);
            // Cache it
            const { saveInfoToCache } = await import('@/lib/info-cache');
            saveInfoToCache(storefront, data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch Info for logo:', error);
      }
    };
    fetchInfo();
  }, [storefront]);
  
  const logoPath = getStorefrontLogo(storefront, info);
  // Get primary color from Info document (always prioritize Info over hardcoded theme)
  const theme = getStorefrontTheme(storefront, info);
  const primaryColor = info?.colorPrimary || theme.primaryColor || '#ec4899';
  const primaryColorHover = info?.colorPrimary ? `${info.colorPrimary}E6` : (theme.primaryColorHover || '#db2777');
  
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState({
    essential: true, // Always true (required)
    analytics: false,
    functional: false,
  });

  useEffect(() => {
    // Check if user has already given consent
    // Check both localStorage and cookies for more robust detection
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    const cookieConsent = document.cookie.split(';').some(cookie => cookie.trim().startsWith(`${COOKIE_CONSENT_KEY}=`));
    
    if (!consent && !cookieConsent) {
      // Load saved preferences if they exist
      const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
      if (savedPrefs) {
        try {
          setPreferences(JSON.parse(savedPrefs));
        } catch (e) {
          // Invalid preferences, use defaults
        }
      }
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = {
      essential: true,
      analytics: true,
      functional: true,
    };
    saveConsent(allAccepted);
  };

  const handleAcceptMinimal = () => {
    // Only essential cookies (already set to true)
    saveConsent(preferences);
  };

  const handleSavePreferences = () => {
    saveConsent(preferences);
  };

  const saveConsent = (prefs) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefs));
    
    // Also set a cookie for server-side detection
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year expiry
    document.cookie = `${COOKIE_CONSENT_KEY}=true; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
    
    setIsVisible(false);
    
    // Apply cookie preferences
    applyCookiePreferences(prefs);
    
    console.log('[COOKIE CONSENT] ✅ User consent saved:', prefs);
  };

  const applyCookiePreferences = (prefs) => {
    // Essential cookies are always set by middleware
    // Analytics: Only if user accepted
    if (!prefs.analytics) {
      // Disable Google Analytics (if implemented)
      // window['ga-disable-G-5ZCK1DEDBS'] = true;
    }
    
    // Functional cookies: Only if user accepted
    // Language and cart cookies will be set/removed based on preferences
    // This is handled automatically by the app based on cookie presence
  };

  const togglePreference = (category) => {
    if (category === 'essential') return; // Can't disable essential
    
    setPreferences((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-gray-300 shadow-2xl">
      <div className="max-w-7xl mx-auto px-6 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 flex-1 w-full lg:w-auto">
            {/* Storefront Logo */}
            <div className="flex-shrink-0">
              <img
                src={logoPath}
                alt="Logo"
                className="h-12 w-auto object-contain"
              />
            </div>
            
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                Cookie Preferences
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                We use cookies to enhance your experience. Essential cookies (location and storefront) are required for the site to work.
                {!showDetails && (
                  <button
                    onClick={() => setShowDetails(true)}
                    className="ml-1 hover:underline font-medium"
                    style={{ color: primaryColor }}
                  >
                    Learn more
                  </button>
                )}
              </p>
            
              {showDetails && (
                <div className="mt-5 space-y-4">
                  {Object.entries(COOKIE_CATEGORIES).map(([key, category]) => (
                    <div key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-gray-900">
                              {category.name}
                              {category.required && (
                                <span className="ml-2 text-xs text-gray-500 font-normal">(Required)</span>
                              )}
                            </h4>
                          </div>
                          <p className="text-xs text-gray-700 mt-2 leading-relaxed">{category.description}</p>
                          <p className="text-xs text-gray-600 mt-2">
                            Cookies: {category.cookies.join(', ')}
                          </p>
                        </div>
                        {!category.required && (
                          <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={preferences[key]}
                              onChange={() => togglePreference(key)}
                              className="sr-only peer"
                            />
                            <div 
                              className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                              style={{
                                backgroundColor: preferences[key] ? primaryColor : undefined,
                              }}
                            ></div>
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto flex-shrink-0">
          {showDetails ? (
            <>
              <button
                onClick={handleSavePreferences}
                className="px-6 py-3 text-white rounded-lg transition-colors text-sm font-semibold"
                style={{
                  backgroundColor: primaryColor,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = primaryColorHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = primaryColor;
                }}
              >
                Save Preferences
              </button>
              <button
                onClick={() => setShowDetails(false)}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleAcceptMinimal}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
              >
                Accept Essential Only
              </button>
              <button
                onClick={handleAcceptAll}
                className="px-6 py-3 text-white rounded-lg transition-colors text-sm font-semibold"
                style={{
                  backgroundColor: primaryColor,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = primaryColorHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = primaryColor;
                }}
              >
                Accept All
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

