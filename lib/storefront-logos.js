/**
 * Storefront theme configuration
 * Maps storefront codes to their logos and theme colors
 */
export const STOREFRONT_THEMES = {
  LUNERA: {
    logo: '/Blerinas/Lunera_logo.png',
    primaryColor: '#ec4899', // Pink
    primaryColorHover: '#db2777', // Darker pink for hover
    textColor: '#ec4899', // Text color (same as primary)
    borderColor: '#ec4899', // Border color
  },
  FIVESTARFINDS: {
    logo: '/FivestarFinds/Blerinas-logo-transparent2.png', // Temporary: using Blerinas logo until FIVESTARFINDS logo is available
    primaryColor: '#14b8a6', // Turquoise
    primaryColorHover: '#0d9488', // Darker turquoise for hover
    textColor: '#14b8a6', // Text color (same as primary)
    borderColor: '#14b8a6', // Border color
  },
  // Add other storefronts here as needed
  // GIFTSHOP: {
  //   logo: '/Giftshop/giftshop-logo.png',
  //   primaryColor: '#000000', // Black
  //   primaryColorHover: '#1a1a1a',
  //   textColor: '#000000',
  //   borderColor: '#000000',
  // },
};

/**
 * Blerinas logo - fallback for all storefronts
 */
const BLERINAS_LOGO = '/Blerinas/Blerinas-logo-transparent2.png';

/**
 * Get logo path for a storefront
 * Priority: 1. Info document logo, 2. STOREFRONT_THEMES mapping, 3. Blerinas logo
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
  
  // Priority 2: Check STOREFRONT_THEMES mapping
  if (STOREFRONT_THEMES[normalizedStorefront]?.logo) {
    return STOREFRONT_THEMES[normalizedStorefront].logo;
  }
  
  // Priority 3: Fallback to Blerinas logo (company logo)
  return BLERINAS_LOGO;
}

/**
 * Get theme configuration for a storefront
 * @param {string} storefront - Storefront code (e.g., 'LUNERA')
 * @returns {Object} Theme configuration with colors
 */
export function getStorefrontTheme(storefront = 'LUNERA') {
  return STOREFRONT_THEMES[storefront] || STOREFRONT_THEMES.LUNERA;
}

/**
 * Banner image paths - static files in public/banners/ for fast loading
 * These are served directly from the public folder, no Firebase Storage needed
 */
const BANNER_IMAGES = {
  LUNERA: '/banners/lunera-banner.png',
  FIVESTARFINDS: '/banners/fivestarfinds-banner.jpg',
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

