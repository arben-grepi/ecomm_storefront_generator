/**
 * Storefront theme configuration
 * Maps storefront codes to their logos and theme colors
 */
export const STOREFRONT_THEMES = {
  LUNERA: {
    logo: '/Blerinas/Blerinas-logo-transparent2.png',
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
 * Get logo path for a storefront
 * @param {string} storefront - Storefront code (e.g., 'LUNERA')
 * @returns {string} Logo path or default logo
 */
export function getStorefrontLogo(storefront = 'LUNERA') {
  return STOREFRONT_THEMES[storefront]?.logo || STOREFRONT_THEMES.LUNERA.logo;
}

/**
 * Get theme configuration for a storefront
 * @param {string} storefront - Storefront code (e.g., 'LUNERA')
 * @returns {Object} Theme configuration with colors
 */
export function getStorefrontTheme(storefront = 'LUNERA') {
  return STOREFRONT_THEMES[storefront] || STOREFRONT_THEMES.LUNERA;
}

