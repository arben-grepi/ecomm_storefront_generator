'use client';

import { useState, useEffect } from 'react';

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
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState({
    essential: true, // Always true (required)
    analytics: false,
    functional: false,
  });

  useEffect(() => {
    // Check if user has already given consent
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Cookie Preferences
            </h3>
            <p className="text-sm text-gray-600">
              We use cookies to enhance your experience. Essential cookies (location and storefront) are required for the site to work.
              {!showDetails && (
                <button
                  onClick={() => setShowDetails(true)}
                  className="ml-1 text-primary hover:underline"
                >
                  Learn more
                </button>
              )}
            </p>
            
            {showDetails && (
              <div className="mt-4 space-y-3">
                {Object.entries(COOKIE_CATEGORIES).map(([key, category]) => (
                  <div key={key} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            {category.name}
                            {category.required && (
                              <span className="ml-2 text-xs text-gray-500">(Required)</span>
                            )}
                          </h4>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{category.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Cookies: {category.cookies.join(', ')}
                        </p>
                      </div>
                      {!category.required && (
                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                          <input
                            type="checkbox"
                            checked={preferences[key]}
                            onChange={() => togglePreference(key)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {showDetails ? (
              <>
                <button
                  onClick={handleSavePreferences}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                  Save Preferences
                </button>
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleAcceptMinimal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  Accept Essential Only
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
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

