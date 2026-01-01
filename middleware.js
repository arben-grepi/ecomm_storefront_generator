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
  const { pathname, search, origin } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  
  // 🔍 DEBUG LOGGING - Domain Redirect Logic
  console.log('========================================');
  console.log('[MIDDLEWARE] 🔍 DOMAIN REDIRECT DEBUG');
  console.log(`[MIDDLEWARE] Hostname: "${hostname}"`);
  console.log(`[MIDDLEWARE] Pathname: "${pathname}"`);
  console.log(`[MIDDLEWARE] Origin: "${origin}"`);
  console.log(`[MIDDLEWARE] Full URL: "${request.nextUrl.toString()}"`);
  console.log(`[MIDDLEWARE] Request URL: ${request.url}`);
  
  // Minimal logging - only essential information
  const cookieNames = request.cookies.getAll().map(c => c.name).join(', ') || 'none';
  
  // Domain-based routing: blerinas.com should route to /HEALTH, only luneralingerie.com can access root
  const isBlerinasDomain = hostname.includes('blerinas.com');
  const isLuneraDomain = hostname.includes('luneralingerie.com');
  
  console.log(`[MIDDLEWARE] isBlerinasDomain: ${isBlerinasDomain}`);
  console.log(`[MIDDLEWARE] isLuneraDomain: ${isLuneraDomain}`);
  
  // Skip middleware for API routes, static files, admin routes, and unavailable page
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/unavailable') ||
    pathname.startsWith('/admin') ||
    pathname.includes('.')
  ) {
    console.log(`[MIDDLEWARE] ⏭️  Skipping middleware (excluded path: ${pathname})`);
    return NextResponse.next();
  }
  
  // Only apply domain redirects in production (not in development)
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`[MIDDLEWARE] Environment: ${process.env.NODE_ENV}, isProduction: ${isProduction}`);
  
  // If accessing blerinas.com at root path, redirect to blerinas.com/HEALTH
  // ONLY in production - skip in development
  // ONLY redirect blerinas.com, NOT luneralingerie.com
  if (isProduction && isBlerinasDomain && !isLuneraDomain && pathname === '/') {
    console.log(`[MIDDLEWARE] 🔄 REDIRECT: blerinas.com root path -> /HEALTH`);
    
    // Construct redirect URL - try multiple approaches
    const protocol = request.nextUrl.protocol || 'https:';
    const redirectUrlString = `${protocol}//blerinas.com/HEALTH${search}`;
    console.log(`[MIDDLEWARE] Constructed redirect URL string: "${redirectUrlString}"`);
    
    try {
      // Try approach 1: Create new URL object
      const redirectUrl = new URL(redirectUrlString);
      console.log(`[MIDDLEWARE] ✅ Created new URL object: ${redirectUrl.toString()}`);
      
      const redirectResponse = NextResponse.redirect(redirectUrl);
      console.log(`[MIDDLEWARE] Redirect response status: ${redirectResponse.status}`);
      console.log(`[MIDDLEWARE] Redirect response location header: ${redirectResponse.headers.get('location')}`);
      return redirectResponse;
    } catch (urlError) {
      console.error(`[MIDDLEWARE] ❌ ERROR creating URL object: ${urlError.message}`);
      
      // Fallback: Try modifying the existing URL object
      try {
        const url = request.nextUrl.clone();
        url.hostname = 'blerinas.com';
        url.pathname = '/HEALTH';
        console.log(`[MIDDLEWARE] Fallback: Using cloned URL: ${url.toString()}`);
        return NextResponse.redirect(url);
      } catch (fallbackError) {
        console.error(`[MIDDLEWARE] ❌ ERROR with fallback: ${fallbackError.message}`);
        // Last resort: use string directly
        return NextResponse.redirect(redirectUrlString);
      }
    }
  }
  
  console.log(`[MIDDLEWARE] ⏭️  No redirect triggered, continuing...`);

  // Extract storefront from URL path
  // Root (/) is LUNERA (default storefront)
  // Other storefronts are at /FIVESTARFINDS, etc.
  // Product URLs: /product-slug (LUNERA) or /storefront/product-slug
  const segments = pathname.split('/').filter(Boolean);
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart', 'orders', 'checkout'];
  let storefront = null;
  
  // Check if we're on the cart page - if so, use existing storefront cookie or default
  if (pathname === '/cart' || pathname.startsWith('/cart/')) {
    // On cart page, preserve the existing storefront cookie (don't change it)
    const existingStorefront = request.cookies.get('storefront')?.value;
    storefront = existingStorefront || 'LUNERA';
  } else if (segments.length === 0 || pathname === '/') {
    // Root path (/) is LUNERA (default storefront)
    storefront = 'LUNERA';
  } else if (segments.length === 1 && !excludedSegments.includes(segments[0].toLowerCase())) {
    // Single segment - could be storefront home (e.g., /FIVESTARFINDS) or product (e.g., /product-slug)
    // If it's all uppercase and no hyphens, treat as storefront; otherwise treat as product (LUNERA)
    const firstSegment = segments[0];
    const isLikelyStorefront = firstSegment === firstSegment.toUpperCase() && !firstSegment.includes('-');
    storefront = isLikelyStorefront ? firstSegment.toUpperCase() : 'LUNERA';
  } else if (segments.length >= 2 && !excludedSegments.includes(segments[0].toLowerCase())) {
    // Two or more segments (e.g., /FIVESTARFINDS/product-slug)
    // First segment is a storefront name
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

