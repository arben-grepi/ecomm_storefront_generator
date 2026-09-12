/**
 * Server-side utility to extract storefront from URL path
 */

import { pathSegmentToStorefront } from '@/lib/storefront-paths';

/**
 * Extract storefront from request referer header or URL
 */
export function getStorefrontFromRequest(request, fallback = 'LUNERA') {
  try {
    const referer = request.headers.get('referer') || request.headers.get('x-pathname') || '';
    if (referer) {
      const url = new URL(referer);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0 && segments[0] !== 'admin' && segments[0] !== 'api') {
        return pathSegmentToStorefront(segments[0]) || fallback;
      }
    }
  } catch (e) {
    try {
      const pathname = request.headers.get('referer') || '';
      const segments = pathname.split('/').filter(Boolean);
      const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart', 'orders', 'checkout'];

      if (segments.length >= 1 && !excludedSegments.includes(segments[0].toLowerCase())) {
        return pathSegmentToStorefront(segments[0]) || fallback;
      }
    } catch (e2) {
      // Fall through
    }
  }

  return fallback;
}

/**
 * Extract storefront from Next.js headers (for server components)
 */
export async function getStorefrontFromHeaders(headers, fallback = 'LUNERA') {
  try {
    const headersObj = headers instanceof Promise ? await headers : headers;

    const cookieHeader = headersObj.get('cookie') || '';
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      const storefrontCookie = cookies.find(c => c.startsWith('storefront='));
      if (storefrontCookie) {
        const storefront = storefrontCookie.split('=')[1];
        if (storefront) return storefront;
      }
    }

    const pathname = headersObj.get('x-pathname') || headersObj.get('referer') || '';
    if (pathname) {
      let path = pathname;
      try {
        const url = new URL(pathname);
        path = url.pathname;
      } catch (e) {
        // Not a full URL
      }

      const segments = path.split('/').filter(Boolean);
      const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart', 'orders', 'checkout'];

      if (segments.length === 0) {
        return fallback;
      }
      if (!excludedSegments.includes(segments[0].toLowerCase())) {
        return pathSegmentToStorefront(segments[0]) || fallback;
      }
    }
  } catch (e) {
    // Fall through
  }

  return fallback;
}
