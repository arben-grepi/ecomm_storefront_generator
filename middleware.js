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
async function getCountryFromIP(ip, isDevelopment = false) {
  // In development, default to 'DE' (Germany) for testing (can be overridden via env var)
  if (isDevelopment && (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.'))) {
    const devCountry = process.env.NEXT_PUBLIC_DEV_COUNTRY || 'DE';
    console.log(`[MIDDLEWARE] 🧪 Development mode - using default country: ${devCountry} (set NEXT_PUBLIC_DEV_COUNTRY to override)`);
    return devCountry;
  }
  
  // Skip localhost/private IPs in production (shouldn't happen, but safety check)
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return null;
  }

  try {
    // Try ipapi.co first (free, no API key needed)
    const response = await fetch(`https://ipapi.co/${ip}/country/`, {
      headers: {
        'User-Agent': 'Next.js-Middleware/1.0',
      },
      // Add timeout to avoid hanging
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });
    
    if (response.ok) {
      const country = (await response.text()).trim();
      if (country && country.length === 2) {
        return country.toUpperCase();
      }
    }
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
          return data.countryCode.toUpperCase();
        }
      }
    } catch (fallbackError) {
      console.warn(`[MIDDLEWARE] ⚠️  Both IP geolocation APIs failed: ${error.message}, ${fallbackError.message}`);
    }
  }
  
  return null;
}

export async function middleware(request) {
  // 🔍 FIRST FILE EXECUTED - Middleware runs on Edge Runtime
  // ⚠️ BREAKPOINTS DON'T WORK HERE - Use console.log for debugging
  const middlewareStartTime = Date.now();
  const { pathname } = request.nextUrl;
  
  // 🔍 DEBUG: Log all request details
  console.log(`\n[MIDDLEWARE] ========================================`);
  console.log(`[MIDDLEWARE] 🚦 Request received`);
  console.log(`[MIDDLEWARE] 📍 Path: ${pathname}`);
  console.log(`[MIDDLEWARE] 🌐 URL: ${request.nextUrl.href}`);
  // Only log cookie names (not values) to avoid exposing session tokens
  const cookieNames = request.cookies.getAll().map(c => c.name).join(', ') || 'none';
  console.log(`[MIDDLEWARE] 🍪 Cookie names: ${cookieNames}`);
  console.log(`[MIDDLEWARE] 🌍 Geo:`, request.geo || 'none');
  
  // Skip middleware for API routes, static files, admin routes, and unavailable page
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/unavailable') ||
    pathname.startsWith('/admin') ||
    pathname.includes('.')
  ) {
    const duration = Date.now() - middlewareStartTime;
    console.log(`[MIDDLEWARE] ⏭️  Skipping middleware (excluded path) - ${duration}ms`);
    console.log(`[MIDDLEWARE] ========================================\n`);
    return NextResponse.next();
  }

  // Extract storefront from URL path
  const segments = pathname.split('/').filter(Boolean);
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart'];
  let storefront = null;
  
  // Don't log URL segments - could reveal internal structure
  
  // Check if we're on the cart page - if so, use existing storefront cookie or default
  if (pathname === '/cart' || pathname.startsWith('/cart/')) {
    // On cart page, preserve the existing storefront cookie (don't change it)
    const existingStorefront = request.cookies.get('storefront')?.value;
    storefront = existingStorefront || 'LUNERA';
    console.log(`[MIDDLEWARE] 🛒 Cart page detected - preserving storefront: ${storefront}`);
  } else if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = segments[0].toUpperCase();
    console.log(`[MIDDLEWARE] 📍 Storefront detected from URL: ${storefront}`);
  } else {
    // For other excluded paths, use existing cookie or default
    const existingStorefront = request.cookies.get('storefront')?.value;
    storefront = existingStorefront || 'LUNERA';
    console.log(`[MIDDLEWARE] 📍 Using existing storefront cookie or default: ${storefront}`);
  }
  
  console.log(`[MIDDLEWARE] ✅ Final storefront: ${storefront}`); 

  // Check if market is already set in cookie (memoization - skip detection if already set)
  const existingMarket = request.cookies.get('market')?.value;
  const existingStorefrontCookie = request.cookies.get('storefront')?.value;
  console.log(`[MIDDLEWARE] 🍪 Existing cookies - Market: ${existingMarket || 'none'}, Storefront: ${existingStorefrontCookie || 'none'}`);
  
  let country = existingMarket; // Use existing market if available
  let shouldSetMarketCookie = false;
  
  // Only detect country if market cookie doesn't exist or is invalid
  if (!country || !SUPPORTED_MARKETS.includes(country)) {
    console.log(`[MIDDLEWARE] 🌍 Market cookie missing or invalid (${country || 'none'}), detecting from IP...`);
    
    // Try method 1: Next.js/Vercel Edge Runtime geo (works on Vercel directly, not Firebase App Hosting)
    let geoCountry = request.geo?.country;
    
    // Try method 2: External IP geolocation API (works on Firebase App Hosting and when request.geo fails)
    if (!geoCountry) {
      console.log(`[MIDDLEWARE] 🔍 request.geo not available (${request.geo ? 'object exists but no country' : 'undefined'}), trying external IP geolocation API...`);
      
      const clientIP = getClientIP(request);
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      console.log(`[MIDDLEWARE] 🔍 Extracted client IP: ${clientIP || 'null'} (isDevelopment: ${isDevelopment})`);
      
      if (clientIP) {
        console.log(`[MIDDLEWARE] 🔍 Calling external IP geolocation API for IP: ${clientIP}...`);
        geoCountry = await getCountryFromIP(clientIP, isDevelopment);
        if (geoCountry) {
          console.log(`[MIDDLEWARE] ✅ External API detected country: ${geoCountry}`);
        } else {
          console.warn(`[MIDDLEWARE] ⚠️  External IP geolocation API failed for IP: ${clientIP} - will use fallback`);
        }
      } else {
        // In development, still try with null IP to get the dev fallback
        if (isDevelopment) {
          console.log(`[MIDDLEWARE] 🧪 Development mode - no client IP, using development fallback...`);
          geoCountry = await getCountryFromIP(null, isDevelopment);
          if (geoCountry) {
            console.log(`[MIDDLEWARE] ✅ Development mode - using default country: ${geoCountry}`);
          }
        } else {
          console.warn(`[MIDDLEWARE] ⚠️  Could not extract client IP address from headers - will use fallback`);
        }
      }
    } else {
      console.log(`[MIDDLEWARE] ✅ request.geo detected country: ${geoCountry}`);
    }
    
    // Use detected country or fallback to 'DE' (Germany) if all methods fail
    country = geoCountry || 'DE';
    shouldSetMarketCookie = true; // Set cookie with detected country (or fallback)
    console.log(`[MIDDLEWARE] 🌍 Final detected country: ${geoCountry || 'none'} (using: ${country})`);
    
    // Check if market is supported
    if (!SUPPORTED_MARKETS.includes(country)) {
      console.log(`[MIDDLEWARE] ❌ Unsupported country detected: ${country}, redirecting to /unavailable`);
      const url = request.nextUrl.clone();
      url.pathname = '/unavailable';
      url.searchParams.set('country', country);
      
      const duration = Date.now() - middlewareStartTime;
      console.log(`[MIDDLEWARE] 🔀 Redirecting to /unavailable (${duration}ms)`);
      console.log(`[MIDDLEWARE] ========================================\n`);
      return NextResponse.redirect(url);
    }
  } else {
    console.log(`[MIDDLEWARE] ✅ Using existing market cookie: ${country}`);
  }
  
  // Set cookies (only if needed)
  const response = NextResponse.next();
  
  // Set market cookie (only if we detected it and it's not already set)
  if (shouldSetMarketCookie) {
    console.log(`[MIDDLEWARE] 🍪 Setting market cookie: ${country} (30 days)`);
    response.cookies.set('market', country, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax'
    });
  } else {
    console.log(`[MIDDLEWARE] 🍪 Market cookie already set, skipping`);
  }
  
  // Set storefront cookie (only if it changed or doesn't exist, and we're not on cart page)
  // On cart page, we preserve the existing cookie and don't update it
  if (pathname !== '/cart' && !pathname.startsWith('/cart/')) {
    if (existingStorefrontCookie !== storefront) {
      console.log(`[MIDDLEWARE] 🍪 Setting storefront cookie: ${storefront} (was: ${existingStorefrontCookie || 'none'}, 30 days)`);
      response.cookies.set('storefront', storefront, {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
        sameSite: 'lax'
      });
    } else {
      console.log(`[MIDDLEWARE] 🍪 Storefront cookie already set (${storefront}), skipping`);
    }
  } else {
    console.log(`[MIDDLEWARE] 🍪 Cart page - preserving existing storefront cookie (${storefront})`);
  }
  
  const duration = Date.now() - middlewareStartTime;
  console.log(`[MIDDLEWARE] ✅ Middleware complete - Market: ${country}, Storefront: ${storefront} (${duration}ms)`);
  console.log(`[MIDDLEWARE] ========================================\n`);
  
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

