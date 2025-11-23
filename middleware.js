import { NextResponse } from 'next/server';
import { SUPPORTED_MARKETS } from './lib/market-utils';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  
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
  const segments = pathname.split('/').filter(Boolean);
  const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next'];
  let storefront = null;
  
  if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = segments[0].toUpperCase();
  } else {
    storefront = 'LUNERA'; // Default
  }
  
  // Check if market is already set in cookie (memoization - skip detection if already set)
  const existingMarket = request.cookies.get('market')?.value;
  let country = existingMarket; // Use existing market if available
  let shouldSetMarketCookie = false;
  
  // Only detect country if market cookie doesn't exist or is invalid
  if (!country || !SUPPORTED_MARKETS.includes(country)) {
    // Detect country from IP geolocation
    country = request.geo?.country || 'FI';
    shouldSetMarketCookie = true; // Need to set cookie since we detected it
    
    // Check if market is supported
    if (!SUPPORTED_MARKETS.includes(country)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unavailable';
      url.searchParams.set('country', country);
      
      // Track unsupported country visit (async, don't await)
      fetch(`${request.nextUrl.origin}/api/track-unsupported-country`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, pathname }),
      }).catch(err => console.error('[Middleware] Failed to track unsupported country:', err));
      
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
    // Log country detection for debugging
    console.log(`[Middleware] Detected country: ${country} (from IP geolocation)`);
  } else {
    // Log existing market cookie
    console.log(`[Middleware] Using existing market cookie: ${country}`);
  }
  
  // Set storefront cookie (only if it changed or doesn't exist)
  const existingStorefront = request.cookies.get('storefront')?.value;
  if (existingStorefront !== storefront) {
    response.cookies.set('storefront', storefront, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax'
    });
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
     * - favicon.ico (favicon file)
     * - admin (admin routes)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|admin).*)',
  ],
};

