/**
 * Market utilities for country detection and market configuration
 */

export const SUPPORTED_MARKETS = ['FI', 'DE'];

export const MARKET_CONFIG = {
  FI: {
    code: 'FI',
    name: 'Finland',
    currency: 'EUR',
    locale: 'fi-FI',
    shippingEstimate: '7.00', // Fallback estimate (EUR) - will be replaced by actual Shopify rate if available
    deliveryEstimateDays: '7-10' // Estimated delivery time in days
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    locale: 'de-DE',
    shippingEstimate: '9.00', // Fallback estimate (EUR) - will be replaced by actual Shopify rate if available
    deliveryEstimateDays: '7-10' // Estimated delivery time in days
  }
};

export function isMarketSupported(countryCode) {
  return SUPPORTED_MARKETS.includes(countryCode);
}

export function getMarketConfig(countryCode) {
  return MARKET_CONFIG[countryCode] || MARKET_CONFIG['DE'];
}

export function getCountryName(countryCode) {
  const countries = {
    FI: 'Finland',
    DE: 'Germany',
    SE: 'Sweden',
    NO: 'Norway',
    DK: 'Denmark',
    US: 'United States',
    GB: 'United Kingdom',
    FR: 'France',
    IT: 'Italy',
    ES: 'Spain',
    NL: 'Netherlands',
    BE: 'Belgium',
    AT: 'Austria',
    CH: 'Switzerland',
    PL: 'Poland',
    CZ: 'Czech Republic',
    IE: 'Ireland',
    AU: 'Australia',
    NZ: 'New Zealand',
    CA: 'Canada',
    JP: 'Japan',
    KR: 'South Korea',
    SG: 'Singapore',
    HK: 'Hong Kong',
    MY: 'Malaysia',
    IL: 'Israel',
    AE: 'United Arab Emirates',
  };
  return countries[countryCode] || countryCode;
}

/**
 * Check if a market uses EUR currency (EU markets)
 * Uses MARKET_CONFIG to determine currency, so it scales automatically
 * @param {string} market - Market code (e.g., 'FI', 'DE', 'US')
 * @returns {boolean} True if market uses EUR
 */
export function isEUMarket(market) {
  const config = getMarketConfig(market);
  return config.currency === 'EUR';
}

/**
 * Get currency for a market
 * Uses MARKET_CONFIG, so it scales automatically
 * @param {string} market - Market code (e.g., 'FI', 'DE', 'US')
 * @returns {string} Currency code (e.g., 'EUR', 'USD')
 */
export function getMarketCurrency(market) {
  const config = getMarketConfig(market);
  return config.currency || 'USD';
}

/**
 * Get locale for a market
 * Uses MARKET_CONFIG, so it scales automatically
 * @param {string} market - Market code (e.g., 'FI', 'DE', 'US')
 * @returns {string} Locale string (e.g., 'fi-FI', 'de-DE', 'en-US')
 */
export function getMarketLocale(market) {
  const config = getMarketConfig(market);
  return config.locale || 'en-US';
}

/**
 * Build markets array from Shopify publishedInContext results
 */
export function buildMarketsArray(product) {
  const markets = [];
  if (product.publishedInFI) markets.push('FI');
  if (product.publishedInDE) markets.push('DE');
  
  // Log warning if no markets
  if (markets.length === 0) {
    console.warn(`Product ${product.title || product.id} has no markets assigned`);
  }
  
  return markets;
}

