'use client';

// Simple in-memory cache (per session)
let cachedMarket = null;
let cacheInitialized = false;

/**
 * Get user's market from cookie
 * Falls back to 'XK' (Kosovo) if not set
 */
export function getMarket() {
  if (typeof document === 'undefined') {
    return 'XK';
  }

  if (cacheInitialized && cachedMarket) {
    return cachedMarket;
  }

  const cookies = document.cookie.split(';').map(c => c.trim());
  const marketCookie = cookies.find(c => c.startsWith('market='));

  let market = 'XK';

  if (marketCookie) {
    market = marketCookie.split('=')[1] || 'XK';
  }

  cachedMarket = market;
  cacheInitialized = true;

  return market;
}
