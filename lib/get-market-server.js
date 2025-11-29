/**
 * Server-side utility to extract market from request headers (cookies)
 * Used in server components to get the user's market for filtering
 */

/**
 * Extract market from Next.js headers (for server components)
 * Reads from the 'market' cookie set by middleware
 * @param {Promise<Headers>|Headers} headers - Next.js headers object (may be a Promise in Next.js 15+)
 * @param {string} fallback - Fallback market if not found (default: 'FI')
 * @returns {Promise<string>|string} Market code (Promise if headers is a Promise)
 * 
 * IMPORTANT: This fallback is only used temporarily when geo-location hasn't succeeded yet.
 * The middleware will attempt geo-location on EVERY request until it succeeds and sets a cookie.
 * Once geo-location succeeds, the cookie is set and this fallback is no longer needed.
 */
export async function getMarketFromHeaders(headers, fallback = 'FI') {
  try {
    // Unwrap headers if it's a Promise (Next.js 15+)
    const headersObj = headers instanceof Promise ? await headers : headers;
    
    // Get market from cookie (set by middleware)
    const cookieHeader = headersObj.get('cookie') || '';
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const marketCookie = cookies.find(c => c.startsWith('market='));
    
    if (marketCookie) {
      const market = marketCookie.split('=')[1];
      if (market) {
        return market;
      }
    }
  } catch (e) {
    // Fall through to default
  }
  
  return fallback;
}

