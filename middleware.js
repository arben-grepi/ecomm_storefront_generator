import { NextResponse } from 'next/server';
import { SUPPORTED_MARKETS } from './lib/market-utils';

export function middleware(request) {
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

