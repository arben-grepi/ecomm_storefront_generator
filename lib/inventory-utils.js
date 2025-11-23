/**
 * Inventory Utilities
 * 
 * Helper functions for checking inventory availability based on market/country.
 * These functions use location-specific inventory data for multi-market fulfillment.
 */

import {
  getAvailableInventoryForMarket,
  isAvailableInMarket,
  getInventoryBreakdownForMarket,
} from './location-market-mapping';

/**
 * Get available inventory for a variant in a specific market
 * @param {Object} variant - Variant object (from Firestore)
 * @param {string} countryCode - ISO 2-letter country code (e.g., "FI", "US")
 * @returns {number} Total available inventory for this market
 */
export function getVariantStockForMarket(variant, countryCode) {
  return getAvailableInventoryForMarket(variant, countryCode);
}

/**
 * Check if variant is in stock for a specific market
 * @param {Object} variant - Variant object (from Firestore)
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {boolean} True if variant is available for purchase in this market
 */
export function isVariantInStockForMarket(variant, countryCode) {
  return isAvailableInMarket(variant, countryCode);
}

/**
 * Get detailed inventory breakdown for a variant in a specific market
 * @param {Object} variant - Variant object (from Firestore)
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {Object} { totalAvailable, locations: [...] }
 */
export function getVariantInventoryBreakdown(variant, countryCode) {
  return getInventoryBreakdownForMarket(variant, countryCode);
}

/**
 * Check if all cart items are available in the specified market
 * @param {Array} cartItems - Array of cart items with variant data
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {Object} { allAvailable: boolean, unavailableItems: Array }
 */
export function checkCartAvailabilityForMarket(cartItems, countryCode) {
  if (!cartItems || cartItems.length === 0) {
    return { allAvailable: true, unavailableItems: [] };
  }
  
  const unavailableItems = [];
  
  for (const item of cartItems) {
    const variant = item.variant || item;
    if (!isVariantInStockForMarket(variant, countryCode)) {
      unavailableItems.push({
        variantId: variant.id || variant.variantId || variant.shopifyVariantId,
        title: variant.title || item.title || 'Unknown product',
        availableStock: getVariantStockForMarket(variant, countryCode),
      });
    }
  }
  
  return {
    allAvailable: unavailableItems.length === 0,
    unavailableItems,
  };
}


