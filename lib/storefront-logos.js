/**
 * Storefront theme configuration
 * 
 * IMPORTANT: These are FALLBACK colors only. Always prioritize colors from Firestore Info document.
 * These hardcoded values are only used when:
 * 1. Info document doesn't exist
 * 2. Info document doesn't have colorPrimary/colorSecondary set
 * 3. As defaults for CSS variables in globals.css (which can't be dynamic)
 * 
 * To customize colors for a storefront, set them in the Firestore Info document:
 * - colorPrimary: Primary color for buttons, text, accents
 * - colorSecondary: Secondary color for backgrounds, borders
 * - colorTertiary: Tertiary color for disabled states, etc.
 */
export const STOREFRONT_THEMES = {
  LUNERA: {
    logo: '/Blerinas/Lunera_logo.png',
    primaryColor: '#ec4899', // Pink - FALLBACK ONLY
    primaryColorHover: '#db2777', // Darker pink for hover - FALLBACK ONLY
    textColor: '#ec4899', // Text color (same as primary) - FALLBACK ONLY
    borderColor: '#ec4899', // Border color - FALLBACK ONLY
  },
  FIVESTARFINDS: {
    logo: '/FivestarFinds/Blerinas-logo-transparent2.png', // Temporary: using Blerinas logo until FIVESTARFINDS logo is available
    primaryColor: '#14b8a6', // Turquoise - FALLBACK ONLY
    primaryColorHover: '#0d9488', // Darker turquoise for hover - FALLBACK ONLY
    textColor: '#14b8a6', // Text color (same as primary) - FALLBACK ONLY
    borderColor: '#14b8a6', // Border color - FALLBACK ONLY
  },
  HEALTH: {
    logo: '/Blerinas/Blerinas-logo-transparent2.png', // Temporary: using Blerinas logo until HEALTH logo is available
    primaryColor: '#10b981', // Emerald green - FALLBACK ONLY
    primaryColorHover: '#059669', // Darker green for hover - FALLBACK ONLY
    textColor: '#10b981', // Text color (same as primary) - FALLBACK ONLY
    borderColor: '#10b981', // Border color - FALLBACK ONLY
  },
  // Add other storefronts here as needed
  // GIFTSHOP: {
  //   logo: '/Giftshop/giftshop-logo.png',
  //   primaryColor: '#000000', // Black - FALLBACK ONLY
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
 * 
 * IMPORTANT: Always use Info document colors when available. This function returns fallback colors only.
 * 
 * Priority for colors should be:
 * 1. Firestore Info document (colorPrimary, colorSecondary, colorTertiary)
 * 2. This function's fallback colors (from STOREFRONT_THEMES)
 * 3. Default LUNERA colors
 * 
 * @param {string} storefront - Storefront code (e.g., 'LUNERA')
 * @param {Object} info - Optional Info document from Firestore (may contain colorPrimary, colorSecondary, colorTertiary)
 * @returns {Object} Theme configuration with colors (fallback values)
 */
export function getStorefrontTheme(storefront = 'LUNERA', info = null) {
  const theme = STOREFRONT_THEMES[storefront] || STOREFRONT_THEMES.LUNERA;
  
  // If Info document is provided and has colors, merge them (Info takes priority)
  if (info) {
    return {
      ...theme,
      // Only override if Info has these colors set
      primaryColor: info.colorPrimary || theme.primaryColor,
      primaryColorHover: info.colorPrimary ? `${info.colorPrimary}E6` : theme.primaryColorHover,
      textColor: info.colorPrimary || theme.textColor,
      borderColor: info.colorPrimary || theme.borderColor,
      secondaryColor: info.colorSecondary || theme.secondaryColor,
      tertiaryColor: info.colorTertiary || theme.tertiaryColor,
    };
  }
  
  return theme;
}

/**
 * Banner image paths - static files in public/banners/ for fast loading
 * These are served directly from the public folder, no Firebase Storage needed
 */
const BANNER_IMAGES = {
  LUNERA: '/banners/lunera-banner.png',
  FIVESTARFINDS: '/banners/fivestarfinds-banner.jpg',
  HEALTH: '/banners/health-banner.jpg',
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

