'use client';

/**
 * Get user's language based on market/location
 * FI market -> fi language
 * DE market -> de language
 * Others -> en language
 * Can be overridden by language cookie
 */
export function getLanguage() {
  if (typeof document === 'undefined') {
    return 'en'; // Server-side default
  }

  // Check for language override cookie (user preference)
  const cookies = document.cookie.split(';').map(c => c.trim());
  const languageCookie = cookies.find(c => c.startsWith('language='));
  
  if (languageCookie) {
    const language = languageCookie.split('=')[1];
    // Only allow 'en' as override (as per requirements)
    if (language === 'en') {
      return 'en';
    }
  }

  // Detect language from market cookie
  const marketCookie = cookies.find(c => c.startsWith('market='));
  
  if (marketCookie) {
    const market = marketCookie.split('=')[1];
    // Map market to language
    if (market === 'FI') return 'fi';
    if (market === 'DE') return 'de';
    // All other markets default to English
    return 'en';
  }

  // Default to English if no market detected
  return 'en';
}

/**
 * Set language cookie (only allows 'en' as override)
 */
export function setLanguage(language) {
  if (typeof document === 'undefined') return;
  
  // Only allow setting to English (as per requirements)
  if (language !== 'en') {
    console.warn(`Language override only supports 'en', got: ${language}`);
    return;
  }

  // Set cookie for 30 days
  const expiryDate = new Date();
  expiryDate.setTime(expiryDate.getTime() + (30 * 24 * 60 * 60 * 1000));
  
  document.cookie = `language=${language}; expires=${expiryDate.toUTCString()}; path=/; sameSite=lax`;
}

