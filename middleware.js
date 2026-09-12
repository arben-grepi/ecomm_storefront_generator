import { NextResponse } from 'next/server';
import { getStorefrontMarkets } from './lib/market-utils';
import {
  LUNERA_URL_SLUG,
  isLuneraDomain,
  pathSegmentToStorefront,
} from './lib/storefront-paths';

/**
 * Get client's real IP address from request headers
 * Firebase App Hosting / Cloud Run uses standard HTTP headers
 */
function getClientIP(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    const realIP = ips.find(ip =>
      ip &&
      ip !== '127.0.0.1' &&
      ip !== '::1' &&
      !ip.startsWith('192.168.') &&
      !ip.startsWith('10.') &&
      !ip.startsWith('172.16.')
    );
    if (realIP) return realIP;
    if (ips[0]) return ips[0];
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP && realIP !== '127.0.0.1' && realIP !== '::1') {
    return realIP;
  }

  return request.ip || null;
}

/**
 * Prefers ip-api.com (accurate for Kosovo / XK); falls back to ipapi.co
 */
async function getCountryFromIP(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return { country: null, reason: `Cannot geolocate localhost/private IP: ${ip}` };
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, {
      headers: { 'User-Agent': 'Next.js-Middleware/1.0' },
      signal: AbortSignal.timeout(2000),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === 'success' && data.countryCode && data.countryCode.length === 2) {
        return { country: data.countryCode.toUpperCase(), reason: null };
      }
      return { country: null, reason: `ip-api.com returned invalid payload: ${JSON.stringify(data)}` };
    }
    return { country: null, reason: `ip-api.com returned invalid response: ${response.status}` };
  } catch (error) {
    try {
      const fallbackResponse = await fetch(`https://ipapi.co/${ip}/country/`, {
        headers: { 'User-Agent': 'Next.js-Middleware/1.0' },
        signal: AbortSignal.timeout(2000),
      });

      if (fallbackResponse.ok) {
        const country = (await fallbackResponse.text()).trim();
        if (country && country.length === 2) {
          return { country: country.toUpperCase(), reason: null };
        }
      }
      return { country: null, reason: `ipapi.co returned invalid response: ${fallbackResponse.status}` };
    } catch (fallbackError) {
      return { country: null, reason: `Both geolocation APIs failed: ${error.message}, ${fallbackError.message}` };
    }
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const hostname = request.nextUrl.hostname;
  const onLuneraDomain = isLuneraDomain(hostname);

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/unavailable') ||
    pathname.startsWith('/admin') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split('/').filter(Boolean);
  const excludedSegments = [
    'admin', 'api', 'thank-you', 'order-confirmation', 'unavailable',
    '_next', 'cart', 'orders', 'checkout',
  ];

  // --- Production domain: rewrite clean URLs → /luneralingerie/* ---
  // Public: https://luneralingerie.com/  (NOT /luneralingerie)
  if (onLuneraDomain) {
    // If someone hits /luneralingerie on the real domain, redirect to clean URL
    if (segments[0]?.toLowerCase() === LUNERA_URL_SLUG) {
      const rest = segments.slice(1).join('/');
      const url = request.nextUrl.clone();
      url.pathname = rest ? `/${rest}` : '/';
      return NextResponse.redirect(url);
    }

    const first = segments[0]?.toLowerCase();
    const isSystemPath = first && excludedSegments.includes(first);

    if (!isSystemPath) {
      // /, /about, /privacy, /product-slug → internal /luneralingerie/...
      const url = request.nextUrl.clone();
      url.pathname = pathname === '/'
        ? `/${LUNERA_URL_SLUG}`
        : `/${LUNERA_URL_SLUG}${pathname}`;
      const response = NextResponse.rewrite(url);
      return await finishRequest(request, response, 'LUNERA');
    }

    // System paths on lunera domain (cart, checkout, …)
    const storefront = request.cookies.get('storefront')?.value || 'LUNERA';
    return await finishRequest(request, NextResponse.next(), storefront);
  }

  // --- Localhost / other hosts: path-based routing ---
  // Root → /luneralingerie
  if (segments.length === 0 || pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = `/${LUNERA_URL_SLUG}`;
    return NextResponse.redirect(url);
  }

  let storefront = null;

  if (pathname === '/cart' || pathname.startsWith('/cart/')) {
    storefront = request.cookies.get('storefront')?.value || 'LUNERA';
  } else if (segments.length >= 1 && !excludedSegments.includes(segments[0].toLowerCase())) {
    storefront = pathSegmentToStorefront(segments[0]) || 'LUNERA';
  } else {
    storefront = request.cookies.get('storefront')?.value || 'LUNERA';
  }

  return await finishRequest(request, NextResponse.next(), storefront);
}

async function finishRequest(request, response, storefront) {
  const { pathname } = request.nextUrl;
  const allowedMarkets = getStorefrontMarkets(storefront);
  const defaultMarket = allowedMarkets[0] || 'XK';

  const existingMarket = request.cookies.get('market')?.value;
  let country = existingMarket;
  let shouldSetMarketCookie = false;

  if (!country || !allowedMarkets.includes(country)) {
    const clientIP = getClientIP(request);
    let geoCountry = null;

    if (clientIP) {
      const result = await getCountryFromIP(clientIP);
      if (result.country) {
        geoCountry = result.country;
        console.log(`[MIDDLEWARE] ✅ Geo-location: ${geoCountry} (IP: ${clientIP})`);
      } else {
        console.warn(`[MIDDLEWARE] ⚠️  Geo failed for ${clientIP}: ${result.reason}`);
      }
    }

    // Localhost / geo failure: default to storefront's primary market (XK for LUNERA)
    country = geoCountry || defaultMarket;
    shouldSetMarketCookie = true;

    if (!geoCountry) {
      console.log(`[MIDDLEWARE] ⚠️  Using default market: ${country}`);
    }

    if (!allowedMarkets.includes(country)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unavailable';
      url.searchParams.set('country', country);
      return NextResponse.redirect(url);
    }
  }

  if (shouldSetMarketCookie) {
    response.cookies.set('market', country, {
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    });
  }

  if (pathname !== '/cart' && !pathname.startsWith('/cart/')) {
    const existingStorefrontCookie = request.cookies.get('storefront')?.value;
    if (existingStorefrontCookie !== storefront) {
      response.cookies.set('storefront', storefront, {
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        sameSite: 'lax',
      });
    }
  }

  if (storefront && country) {
    const url = new URL(request.url);
    fetch(`${url.origin}/api/track-visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storefront, country }),
    }).catch((error) => {
      console.warn(`[MIDDLEWARE] ⚠️  Failed to track visit: ${error.message}`);
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|admin).*)'],
};
