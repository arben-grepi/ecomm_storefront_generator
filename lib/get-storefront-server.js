/**
 * Server-side utility to extract storefront from URL path
 * Used in server components and API routes
 */

/**
 * Extract storefront from request referer header or URL
 * @param {Request} request - Next.js request object
 * @param {string} fallback - Fallback storefront if not found (default: 'LUNERA')
 * @returns {string} Storefront code
 */
export function getStorefrontFromRequest(request, fallback = 'LUNERA') {
  try {
    // Try to get from referer header (where the request came from)
    const referer = request.headers.get('referer') || request.headers.get('x-pathname') || '';
    if (referer) {
      const url = new URL(referer);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0 && segments[0] !== 'admin' && segments[0] !== 'api') {
        return segments[0].toUpperCase();
      }
    }
  } catch (e) {
    // If referer is not a full URL, try parsing as pathname
    try {
      const pathname = referer || '';
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length > 0 && segments[0] !== 'admin' && segments[0] !== 'api') {
        return segments[0].toUpperCase();
      }
    } catch (e2) {
      // Fall through to default
    }
  }
  
  return fallback;
}

/**
 * Extract storefront from Next.js headers (for server components)
 * @param {Promise<Headers>|Headers} headers - Next.js headers object (may be a Promise in Next.js 15+)
 * @param {string} fallback - Fallback storefront if not found (default: 'LUNERA')
 * @returns {Promise<string>|string} Storefront code (Promise if headers is a Promise)
 */
export async function getStorefrontFromHeaders(headers, fallback = 'LUNERA') {
  try {
    // Unwrap headers if it's a Promise (Next.js 15+)
    const headersObj = headers instanceof Promise ? await headers : headers;
    
    // Try to get from custom header or referer
    const pathname = headersObj.get('x-pathname') || headersObj.get('referer') || '';
    if (pathname) {
      // If it's a full URL, extract pathname
      let path = pathname;
      try {
        const url = new URL(pathname);
        path = url.pathname;
      } catch (e) {
        // Not a full URL, use as-is
      }
      
      const segments = path.split('/').filter(Boolean);
      if (segments.length > 0 && segments[0] !== 'admin' && segments[0] !== 'api') {
        return segments[0].toUpperCase();
      }
    }
  } catch (e) {
    // Fall through to default
  }
  
  return fallback;
}

