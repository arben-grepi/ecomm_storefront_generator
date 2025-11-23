'use client';

/**
 * Get user's market from cookie
 * Falls back to 'FI' if not set
 */
export function getMarket() {
  if (typeof document === 'undefined') {
    return 'FI'; // Server-side default
  }

  // Read market cookie
  const cookies = document.cookie.split(';').map(c => c.trim());
  const marketCookie = cookies.find(c => c.startsWith('market='));
  
  if (marketCookie) {
    const market = marketCookie.split('=')[1];
    return market || 'FI';
  }

  return 'FI'; // Default fallback
}

