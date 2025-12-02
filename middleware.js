import { NextResponse } from 'next/server';
import { SUPPORTED_MARKETS } from './lib/market-utils';

/**
 * Get client's real IP address from request headers
 * Firebase App Hosting / Cloud Run uses standard HTTP headers
 */
function getClientIP(request) {
  // Try various headers (in order of reliability)
  // X-Forwarded-For can contain multiple IPs (client, proxy, etc.) - take the first one
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    // Filter out localhost/private IPs and get the first real IP
    const realIP = ips.find(ip => 
      ip && 
      ip !== '127.0.0.1' && 
      ip !== '::1' && 
      !ip.startsWith('192.168.') && 
      !ip.startsWith('10.') &&
      !ip.startsWith('172.16.')
    );
    if (realIP) return realIP;
    // If no real IP found, use the first one anyway
    if (ips[0]) return ips[0];
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP && realIP !== '127.0.0.1' && realIP !== '::1') {
    return realIP;
  }
  
  // Fallback to connection IP (if available)
  return request.ip || null;
}

/**
 * Get country from IP address using external geolocation API
 * Uses ipapi.co free tier (no API key needed, rate limited)
 * Fallback to ip-api.com if first fails
 * 
 * @param {string} ip - Client IP address
 * @param {boolean} isDevelopment - Whether we're in development mode
 * @returns {Promise<string|null>} Country code (2 letters) or null if detection fails
 */
async function getCountryFromIP(ip) {
  // Skip localhost/private IPs - can't geolocate these
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return { country: null, reason: `Cannot geolocate localhost/private IP: ${ip}` };
  }

  try {
    // Try ipapi.co first (free, no API key needed)
    const response = await fetch(`https://ipapi.co/${ip}/country/`, {
      headers: {
        'User-Agent': 'Next.js-Middleware/1.0',
      },
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });
    
    if (response.ok) {
      const country = (await response.text()).trim();
      if (country && country.length === 2) {
        return { country: country.toUpperCase(), reason: null };
      }
    }
    return { country: null, reason: `ipapi.co returned invalid response: ${response.status}` };
  } catch (error) {
    // If ipapi.co fails, try ip-api.com as fallback
    try {
      const fallbackResponse = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
        headers: {
          'User-Agent': 'Next.js-Middleware/1.0',
        },
        signal: AbortSignal.timeout(2000),
      });
      
      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        if (data.countryCode && data.countryCode.length === 2) {
          return { country: data.countryCode.toUpperCase(), reason: null };
        }
      }
      return { country: null, reason: `ip-api.com returned invalid response: ${fallbackResponse.status}` };
    } catch (fallbackError) {
      return { country: null, reason: `Both geolocation APIs failed: ${error.message}, ${fallbackError.message}` };
    }
  }
}

export async function middleware(request) {
  // 🔍 FIRST FILE EXECUTED - Middleware runs on Edge Runtime
  // ⚠️ BREAKPOINTS DON'T WORK HERE - Use console.log for debugging
  const middlewareStartTime = Date.now();
  const { pathname } = request.nextUrl;
  
  // Minimal logging - only essential information
  const cookieNames = request.cookies.getAll().map(c => c.name).join(', ') || 'none';
  
  // Skip middleware for API routes, static files, admin routes, and unavailable page
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/unavailable') ||
    pathname.startsWith('/admin') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Extract storefront from URL path
  // Root (/) is now LUNERA (default storefront)
  // Other storefronts are at /FIVESTARFINDS, etc.
  const segments = pathname.split('/').filter(Boolean);
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart', 'orders'];
  let storefront = null;
  
  // Check if we're on the cart page - if so, use existing storefront cookie or default
  if (pathname === '/cart' || pathname.startsWith('/cart/')) {
    // On cart page, preserve the existing storefront cookie (don't change it)
    const existingStorefront = request.cookies.get('storefront')?.value;
    storefront = existingStorefront || 'LUNERA';
  } else if (segments.length === 0 || pathname === '/') {
    // Root path (/) is LUNERA (default storefront)
    storefront = 'LUNERA';
  } else if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
    // First segment is a storefront name (e.g., /FIVESTARFINDS)
    storefront = segments[0].toUpperCase();
  } else {
    // For excluded paths (order-confirmation, orders, etc.), use existing cookie or default to LUNERA
    const existingStorefront = request.cookies.get('storefront')?.value;
    storefront = existingStorefront || 'LUNERA';
  } 

  // Check if market is already set in cookie (memoization - skip detection if already set)
  const existingMarket = request.cookies.get('market')?.value;
  let country = existingMarket; // Use existing market if available
  let shouldSetMarketCookie = false;
  
  // Only detect country if market cookie doesn't exist or is invalid
  if (!country || !SUPPORTED_MARKETS.includes(country)) {
    const clientIP = getClientIP(request);
    let geoCountry = null;
    
    if (clientIP) {
      const result = await getCountryFromIP(clientIP);
      if (result.country) {
        geoCountry = result.country;
        console.log(`[MIDDLEWARE] ✅ Geo-location successful: ${geoCountry} (IP: ${clientIP})`);
      } else {
        console.warn(`[MIDDLEWARE] ⚠️  Geo-location failed for IP ${clientIP}: ${result.reason}`);
      }
    } else {
      console.warn(`[MIDDLEWARE] ⚠️  Could not extract client IP`);
    }
    
    // Use detected country or fallback to 'DE' (Germany) if all methods fail
    country = geoCountry || 'DE';
    shouldSetMarketCookie = true;
    
    if (!geoCountry) {
      console.log(`[MIDDLEWARE] ⚠️  Using default country: ${country} (geo-location failed)`);
    }
    
    // Check if market is supported
    if (!SUPPORTED_MARKETS.includes(country)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unavailable';
      url.searchParams.set('country', country);
      return NextResponse.redirect(url);
    }
  }
  
  // Set cookies (only if needed)
  const response = NextResponse.next();
  
  // Set market cookie (only if we detected it and it's not already set)
  if (shouldSetMarketCookie) {
    response.cookies.set('market', country, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax'
    });
  }
  
  // Set storefront cookie (only if it changed or doesn't exist, and we're not on cart page)
  // On cart page, we preserve the existing cookie and don't update it
  if (pathname !== '/cart' && !pathname.startsWith('/cart/')) {
    const existingStorefrontCookie = request.cookies.get('storefront')?.value;
    if (existingStorefrontCookie !== storefront) {
      response.cookies.set('storefront', storefront, {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
        sameSite: 'lax'
      });
    }
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - admin (admin routes)
     */
    '/((?!api|_next/static|_next/image|admin).*)',
  ],
};

