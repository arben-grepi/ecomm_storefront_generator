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
    shippingEstimate: '7.00'
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    locale: 'de-DE',
    shippingEstimate: '9.00'
  }
};

export function isMarketSupported(countryCode) {
  return SUPPORTED_MARKETS.includes(countryCode);
}

export function getMarketConfig(countryCode) {
  return MARKET_CONFIG[countryCode] || MARKET_CONFIG['FI'];
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

