import { NextResponse } from 'next/server';
import { SUPPORTED_MARKETS } from './lib/market-utils';

export function middleware(request) {
  const middlewareStartTime = Date.now();
  const { pathname } = request.nextUrl;
  
  console.log(`[MIDDLEWARE] 🚦 Request received - Path: ${pathname}`);
  
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
    return NextResponse.next();
  }
  
  // Extract storefront from URL path
  const segments = pathname.split('/').filter(Boolean);
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next'];
  let storefront = null;
  
  if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = segments[0].toUpperCase();
    console.log(`[MIDDLEWARE] 📍 Storefront detected from URL: ${storefront}`);
  } else {
    storefront = 'LUNERA'; // Default
    console.log(`[MIDDLEWARE] 📍 Using default storefront: ${storefront}`);
  }
  
  // Check if market is already set in cookie (memoization - skip detection if already set)
  const existingMarket = request.cookies.get('market')?.value;
  const existingStorefront = request.cookies.get('storefront')?.value;
  console.log(`[MIDDLEWARE] 🍪 Existing cookies - Market: ${existingMarket || 'none'}, Storefront: ${existingStorefront || 'none'}`);
  
  let country = existingMarket; // Use existing market if available
  let shouldSetMarketCookie = false;
  
  // Only detect country if market cookie doesn't exist or is invalid
  if (!country || !SUPPORTED_MARKETS.includes(country)) {
    console.log(`[MIDDLEWARE] 🌍 Market cookie missing or invalid (${country || 'none'}), detecting from IP...`);
    // Detect country from IP geolocation
    const geoCountry = request.geo?.country;
    country = geoCountry || 'FI';
    shouldSetMarketCookie = true; // Need to set cookie since we detected it
    console.log(`[MIDDLEWARE] 🌍 Detected country from IP: ${geoCountry || 'none'} (using: ${country})`);
    
    // Check if market is supported
    if (!SUPPORTED_MARKETS.includes(country)) {
      console.log(`[MIDDLEWARE] ❌ Unsupported country detected: ${country}, redirecting to /unavailable`);
      const url = request.nextUrl.clone();
      url.pathname = '/unavailable';
      url.searchParams.set('country', country);
      
      // Track unsupported country visit (async, don't await)
      fetch(`${request.nextUrl.origin}/api/track-unsupported-country`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, pathname }),
      }).catch(err => console.error('[MIDDLEWARE] ❌ Failed to track unsupported country:', err));
      
      const duration = Date.now() - middlewareStartTime;
      console.log(`[MIDDLEWARE] 🔀 Redirecting to /unavailable (${duration}ms)`);
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
  
  // Set storefront cookie (only if it changed or doesn't exist)
  if (existingStorefront !== storefront) {
    console.log(`[MIDDLEWARE] 🍪 Setting storefront cookie: ${storefront} (was: ${existingStorefront || 'none'}, 30 days)`);
    response.cookies.set('storefront', storefront, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax'
    });
  } else {
    console.log(`[MIDDLEWARE] 🍪 Storefront cookie already set (${storefront}), skipping`);
  }
  
  const duration = Date.now() - middlewareStartTime;
  console.log(`[MIDDLEWARE] ✅ Middleware complete - Market: ${country}, Storefront: ${storefront} (${duration}ms)`);
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - admin (admin routes)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|admin).*)',
  ],
};

