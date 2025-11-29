'use client';

// Simple in-memory cache (per session)
let cachedMarket = null;
let cacheInitialized = false;

/**
 * Get user's market from cookie
 * Falls back to 'FI' if not set
 * Uses caching to avoid repeated cookie parsing
 */
export function getMarket() {
  if (typeof document === 'undefined') {
    return 'DE'; // Server-side default
  }

  // Return cached value if available
  if (cacheInitialized && cachedMarket) {
    return cachedMarket;
  }

  // Read market cookie
  const cookies = document.cookie.split(';').map(c => c.trim());
  const marketCookie = cookies.find(c => c.startsWith('market='));
  
  let market = 'DE'; // Default fallback
  
  if (marketCookie) {
    market = marketCookie.split('=')[1] || 'DE';
  }

  // Cache the result
  cachedMarket = market;
  cacheInitialized = true;
  
  return market;
}

