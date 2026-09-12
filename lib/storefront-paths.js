/**
 * URL path helpers for multi-storefront routing.
 *
 * LUNERA uses:
 * - Production domain: https://luneralingerie.com/  (no path prefix)
 * - Localhost:         http://localhost:3000/luneralingerie
 *
 * Other storefronts use /{STOREFRONT} paths.
 */

export const LUNERA_URL_SLUG = 'luneralingerie';
export const LUNERA_DOMAINS = ['luneralingerie.com', 'www.luneralingerie.com'];

/**
 * Map URL path segment → internal Firestore storefront id
 */
export function pathSegmentToStorefront(segment) {
  if (!segment) return null;
  const lower = segment.toLowerCase();
  if (lower === LUNERA_URL_SLUG || lower === 'lunera') return 'LUNERA';
  // Legacy uppercase path storefronts (kept for multi-storefront architecture)
  if (segment === segment.toUpperCase() && !segment.includes('-')) {
    return segment.toUpperCase();
  }
  return null;
}

/**
 * Whether the request host is the LUNERA production domain
 */
export function isLuneraDomain(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase().split(':')[0];
  return LUNERA_DOMAINS.includes(host);
}

/**
 * Base path for storefront links (no trailing slash).
 * LUNERA: '' on luneralingerie.com, '/luneralingerie' on localhost.
 * Others: '/HEALTH' style.
 */
export function getStorefrontBasePath(storefront, hostname) {
  if (storefront === 'LUNERA') {
    let host = hostname;
    if (!host && typeof window !== 'undefined') {
      host = window.location.hostname;
    }
    if (host && isLuneraDomain(host)) return '';
    return `/${LUNERA_URL_SLUG}`;
  }
  return storefront ? `/${storefront}` : '';
}

/**
 * Home / about / privacy / product paths for a storefront
 */
export function getStorefrontHomePath(storefront, hostname) {
  const base = getStorefrontBasePath(storefront, hostname);
  return base || '/';
}

export function getStorefrontAboutPath(storefront, hostname) {
  const base = getStorefrontBasePath(storefront, hostname);
  return `${base}/about`;
}

export function getStorefrontPrivacyPath(storefront, hostname) {
  const base = getStorefrontBasePath(storefront, hostname);
  return `${base}/privacy`;
}

export function getStorefrontProductPath(storefront, productSlug, hostname) {
  const base = getStorefrontBasePath(storefront, hostname);
  return `${base}/${productSlug}`;
}
