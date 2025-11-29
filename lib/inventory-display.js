/**
 * Inventory Display Utilities
 * 
 * Helper functions for displaying inventory status with proper messaging
 * for different inventory policies and market availability.
 */

import { getAvailableInventoryForMarket, isAvailableInMarket } from './location-market-mapping';

/**
 * Get inventory status message for display
 * Handles inventory_policy: 'continue' (dropship) vs 'deny' (stock-based)
 * 
 * @param {Object} variant - Variant object with inventory_levels
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {Object} { status, message, availableQuantity }
 */
export function getInventoryStatus(variant, countryCode = 'DE') {
  if (!variant) {
    return {
      status: 'unknown',
      message: 'Stock status unavailable',
      availableQuantity: 0,
    };
  }

  const availableQty = getAvailableInventoryForMarket(variant, countryCode);
  const isAvailable = isAvailableInMarket(variant, countryCode);
  const inventoryPolicy = variant.inventory_policy || 'deny';

  // If inventory policy is 'continue', allow dropship/backorder
  if (inventoryPolicy === 'continue') {
    if (availableQty > 0) {
      return {
        status: 'in_stock',
        message: `In stock (${availableQty} available)`,
        availableQuantity: availableQty,
      };
    } else {
      return {
        status: 'available_to_order',
        message: 'Available to order (ships from supplier)',
        availableQuantity: 0,
        canPurchase: true, // Can still purchase via dropship
      };
    }
  }

  // Inventory policy is 'deny' - must have stock
  if (availableQty > 0) {
    return {
      status: 'in_stock',
      message: `In stock${availableQty > 1 ? ` (${availableQty} available)` : ''}`,
      availableQuantity: availableQty,
      canPurchase: true,
    };
  } else {
    return {
      status: 'out_of_stock',
      message: 'Out of stock in your region',
      availableQuantity: 0,
      canPurchase: false,
    };
  }
}

/**
 * Get inventory badge/status for UI display
 * @param {Object} variant - Variant object
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {Object} { label, className, canPurchase }
 */
export function getInventoryBadge(variant, countryCode = 'DE') {
  const status = getInventoryStatus(variant, countryCode);

  const badges = {
    in_stock: {
      label: status.availableQuantity > 1 ? `${status.availableQuantity} in stock` : 'In stock',
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      canPurchase: true,
    },
    available_to_order: {
      label: 'Available to order',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      canPurchase: true,
    },
    out_of_stock: {
      label: 'Out of stock',
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      canPurchase: false,
    },
    unknown: {
      label: 'Check availability',
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      canPurchase: false,
    },
  };

  return badges[status.status] || badges.unknown;
}

/**
 * Check if variant can be added to cart
 * @param {Object} variant - Variant object
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {boolean}
 */
export function canAddToCart(variant, countryCode = 'DE') {
  if (!variant) return false;
  
  const status = getInventoryStatus(variant, countryCode);
  return status.canPurchase !== false;
}


