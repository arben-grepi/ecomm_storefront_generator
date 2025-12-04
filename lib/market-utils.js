/**
 * Market utilities for country detection and market configuration
 */

export const SUPPORTED_MARKETS = [
  'FI', 'DE', 'SE', 'NO', 'DK', 'FR', 'IT', 'ES',
  'NL', 'BE', 'AT', 'CH', 'PL', 'IE'
];

export const MARKET_CONFIG = {
  FI: {
    code: 'FI',
    name: 'Finland',
    currency: 'EUR',
    locale: 'fi-FI',
    shippingEstimate: '2.90', // Fallback estimate (EUR) - will be replaced by actual Shopify rate if available
    deliveryEstimateDays: '7-10' // Estimated delivery time in days
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    locale: 'de-DE',
    shippingEstimate: '2.90', // Fallback estimate (EUR) - will be replaced by actual Shopify rate if available
    deliveryEstimateDays: '7-10' // Estimated delivery time in days
  },
  SE: {
    code: 'SE',
    name: 'Sweden',
    currency: 'SEK',
    locale: 'sv-SE',
    shippingEstimate: '2.90', // Fallback estimate (EUR equivalent) - will be replaced by actual Shopify rate if available
    deliveryEstimateDays: '7-10'
  },
  NO: {
    code: 'NO',
    name: 'Norway',
    currency: 'NOK',
    locale: 'nb-NO',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  DK: {
    code: 'DK',
    name: 'Denmark',
    currency: 'DKK',
    locale: 'da-DK',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  FR: {
    code: 'FR',
    name: 'France',
    currency: 'EUR',
    locale: 'fr-FR',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  IT: {
    code: 'IT',
    name: 'Italy',
    currency: 'EUR',
    locale: 'it-IT',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  ES: {
    code: 'ES',
    name: 'Spain',
    currency: 'EUR',
    locale: 'es-ES',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  NL: {
    code: 'NL',
    name: 'Netherlands',
    currency: 'EUR',
    locale: 'nl-NL',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  BE: {
    code: 'BE',
    name: 'Belgium',
    currency: 'EUR',
    locale: 'nl-BE', // or 'fr-BE' depending on region
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  AT: {
    code: 'AT',
    name: 'Austria',
    currency: 'EUR',
    locale: 'de-AT',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  CH: {
    code: 'CH',
    name: 'Switzerland',
    currency: 'CHF',
    locale: 'de-CH', // or 'fr-CH', 'it-CH' depending on region
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  PL: {
    code: 'PL',
    name: 'Poland',
    currency: 'PLN',
    locale: 'pl-PL',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
  },
  IE: {
    code: 'IE',
    name: 'Ireland',
    currency: 'EUR',
    locale: 'en-IE',
    shippingEstimate: '2.90',
    deliveryEstimateDays: '7-10'
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
  if (product.publishedInSE) markets.push('SE');
  if (product.publishedInNO) markets.push('NO');
  if (product.publishedInDK) markets.push('DK');
  if (product.publishedInFR) markets.push('FR');
  if (product.publishedInIT) markets.push('IT');
  if (product.publishedInES) markets.push('ES');
  if (product.publishedInNL) markets.push('NL');
  if (product.publishedInBE) markets.push('BE');
  if (product.publishedInAT) markets.push('AT');
  if (product.publishedInCH) markets.push('CH');
  if (product.publishedInPL) markets.push('PL');
  if (product.publishedInIE) markets.push('IE');
  
  // Log warning if no markets
  if (markets.length === 0) {
    console.warn(`Product ${product.title || product.id} has no markets assigned`);
  }
  
  return markets;
}

