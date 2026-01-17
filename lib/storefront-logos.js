/**
 * Storefront logo configuration
 * 
 * IMPORTANT: Colors come from the Firestore Info document, not from here.
 * This file only stores logo paths as fallbacks.
 * 
 * To customize colors for a storefront, set them in the Firestore Info document:
 * - colorPrimary: Primary color for buttons, text, accents
 * - colorSecondary: Secondary color for backgrounds, borders
 * - colorTertiary: Tertiary color for disabled states, etc.
 * 
 * Color fallbacks are handled by CSS variables in globals.css files.
 */
export const STOREFRONT_LOGOS = {
  LUNERA: {
    logo: '/Blerinas/Lunera_logo.png',
  },
  FIVESTARFINDS: {
    logo: '/FivestarFinds/Blerinas-logo-transparent2.png', // Temporary: using Blerinas logo until FIVESTARFINDS logo is available
  },
  HEALTH: {
    logo: '/Blerinas/Blerinas-logo-transparent2.png', // Temporary: using Blerinas logo until HEALTH logo is available
  },
  LEATHER: {
    logo: '/Blerinas/Blerinas-logo-transparent2.png', // Temporary: using Blerinas logo until LEATHER logo is available
  },
  // Add other storefronts here as needed
};

/**
 * Blerinas logo - fallback for all storefronts
 */
const BLERINAS_LOGO = '/Blerinas/Blerinas-logo-transparent2.png';

/**
 * Get logo path for a storefront
 * Priority: 1. Info document logo, 2. STOREFRONT_LOGOS mapping, 3. Blerinas logo
 * @param {string} storefront - Storefront code (e.g., 'LUNERA')
 * @param {Object} info - Optional Info document from Firestore (may contain logo field)
 * @returns {string} Logo path
 */
export function getStorefrontLogo(storefront = 'LUNERA', info = null) {
  // Normalize storefront to uppercase to ensure case-insensitive matching
  const normalizedStorefront = storefront ? storefront.toUpperCase() : 'LUNERA';
  
  // Priority 1: Check if logo is set in Firestore Info document
  if (info?.logo) {
    return info.logo;
  }
  
  // Priority 2: Check STOREFRONT_LOGOS mapping
  if (STOREFRONT_LOGOS[normalizedStorefront]?.logo) {
    return STOREFRONT_LOGOS[normalizedStorefront].logo;
  }
  
  // Priority 3: Fallback to Blerinas logo (company logo)
  return BLERINAS_LOGO;
}

/**
 * Get colors from Info document with CSS variable fallbacks
 * 
 * IMPORTANT: Info document is the source of truth for all colors.
 * CSS variables in globals.css provide storefront-specific fallbacks.
 * 
 * @param {Object} info - Info document from Firestore (may contain colorPrimary, colorSecondary, colorTertiary)
 * @returns {Object} Color values with fallbacks
 */
export function getColorsFromInfo(info = null) {
  // Default fallbacks (CSS variables will handle storefront-specific defaults)
  const defaultPrimary = '#ec4899'; // LUNERA pink (CSS variable default)
  const defaultSecondary = '#64748b'; // Slate-500
  const defaultTertiary = '#94a3b8'; // Slate-400
  
  return {
    primaryColor: info?.colorPrimary || defaultPrimary,
    primaryColorHover: info?.colorPrimary ? `${info.colorPrimary}E6` : `${defaultPrimary}E6`,
    secondaryColor: info?.colorSecondary || defaultSecondary,
    tertiaryColor: info?.colorTertiary || defaultTertiary,
    textColor: info?.colorPrimary || defaultPrimary, // Same as primary
    borderColor: info?.colorPrimary || defaultPrimary, // Same as primary
  };
}

/**
 * @deprecated Use getColorsFromInfo() instead. This function is kept for backward compatibility
 * but will be removed in a future version.
 */
export function getStorefrontTheme(storefront = 'LUNERA', info = null) {
  return getColorsFromInfo(info);
}

/**
 * Banner image paths - static files in public/banners/ for fast loading
 * These are served directly from the public folder, no Firebase Storage needed
 */
const BANNER_IMAGES = {
  LUNERA: '/banners/lunera-banner.png',
  FIVESTARFINDS: '/banners/fivestarfinds-banner.jpg',
  HEALTH: '/banners/health-banner.jpg',
  LEATHER: '/banners/leather-banner.jpg',
  // Add more storefronts as needed
  // GIFTSHOP: '/banners/giftshop-banner.png',
};

/**
 * Get banner image path for a storefront
 * Uses static files from public/banners/ for fast loading
 * @param {string} storefront - Storefront code (e.g., 'LUNERA')
 * @returns {string} Banner image path
 */
export function getStorefrontBanner(storefront = 'LUNERA') {
  const normalizedStorefront = storefront ? storefront.toUpperCase() : 'LUNERA';
  return BANNER_IMAGES[normalizedStorefront] || BANNER_IMAGES.LUNERA;
}

