/**
 * Location-to-Market Mapping Configuration
 * 
 * Maps Shopify inventory locations to markets/countries they can fulfill.
 * This enables market-specific inventory availability checks.
 */

// Location ID to Market Mapping
// Format: location_id (string) -> { name, markets[], priority }
// markets: Array of ISO 2-letter country codes this location can fulfill
// priority: Lower number = preferred location for this market (local warehouses preferred)
export const LOCATION_MARKET_MAPPING = {
  // DSers fulfillment service - typically global fulfillment
  // Update with your actual DSers location ID when known
  "114729156951": {
    name: "dsers-fulfillment-service",
    markets: ["FI", "SE", "NO", "DK", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "CH", "PL", "CZ", "IE", "GB", "US", "CA", "GLOBAL"], // Can ship globally
    priority: 1, // Lowest priority - use when no local warehouse available
  },
  
  // Add your other locations here as needed
  // Example: Finland warehouse
  // "123456789": {
  //   name: "finland-warehouse",
  //   markets: ["FI", "SE", "NO", "DK"], // Nordic countries only
  //   priority: 2,
  // },
  
  // Example: US warehouse
  // "987654321": {
  //   name: "us-warehouse",
  //   markets: ["US", "CA", "MX"], // North America only
  //   priority: 2,
  // },
};

/**
 * Get locations that can fulfill to a specific market/country
 * @param {string} countryCode - ISO 2-letter country code (e.g., "FI", "US")
 * @returns {Array} Array of location configs sorted by priority (lowest = preferred)
 */
export function getLocationsForMarket(countryCode) {
  if (!countryCode) return [];
  
  const countryCodeUpper = countryCode.toUpperCase();
  
  return Object.entries(LOCATION_MARKET_MAPPING)
    .filter(([locationId, config]) => {
      // Check if location can fulfill to this market
      return (
        config.markets.includes(countryCodeUpper) ||
        config.markets.includes("GLOBAL")
      );
    })
    .map(([locationId, config]) => ({
      locationId,
      ...config,
    }))
    .sort((a, b) => a.priority - b.priority); // Prefer local warehouses (higher priority number = local)
}

/**
 * Get available inventory for a variant in a specific market
 * Sums inventory only from locations that can fulfill to that market
 * @param {Object} variant - Variant object with inventory_levels array
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {number} Total available inventory for this market
 */
export function getAvailableInventoryForMarket(variant, countryCode) {
  if (!variant || !countryCode) return 0;
  
  // Get locations that can fulfill to this market
  const availableLocations = getLocationsForMarket(countryCode);
  
  if (availableLocations.length === 0) {
    return 0; // No locations can fulfill to this market
  }
  
  // Extract location IDs
  const availableLocationIds = availableLocations.map(loc => loc.locationId);
  
  // Get inventory_levels array (can be in variant.inventory_levels or variant.rawProduct variants)
  const inventoryLevels = variant.inventory_levels || [];
  
  if (!Array.isArray(inventoryLevels) || inventoryLevels.length === 0) {
    return 0;
  }
  
  // Sum inventory only from locations that can fulfill to this market
  const totalAvailable = inventoryLevels
    .filter(level => {
      const levelLocationId = level.location_id?.toString() || level.location_id;
      return availableLocationIds.includes(levelLocationId);
    })
    .reduce((sum, level) => sum + (level.available || 0), 0);
  
  return totalAvailable;
}

/**
 * Check if a variant is available in a specific market
 * @param {Object} variant - Variant object with inventory_levels array
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {boolean} True if variant is available for purchase in this market
 */
export function isAvailableInMarket(variant, countryCode) {
  if (!variant) return false;
  
  // Check inventory policy - if "continue", can sell even with 0 stock (dropship)
  if (variant.inventory_policy === 'continue') {
    return true;
  }
  
  // Check market-specific inventory
  const available = getAvailableInventoryForMarket(variant, countryCode);
  return available > 0;
}

/**
 * Get inventory breakdown for a variant in a specific market
 * Returns detailed information about which locations have stock
 * @param {Object} variant - Variant object with inventory_levels array
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {Object} { totalAvailable, locations: [{ location_id, location_name, available }] }
 */
export function getInventoryBreakdownForMarket(variant, countryCode) {
  if (!variant || !countryCode) {
    return { totalAvailable: 0, locations: [] };
  }
  
  const availableLocations = getLocationsForMarket(countryCode);
  const availableLocationIds = availableLocations.map(loc => loc.locationId);
  
  const inventoryLevels = variant.inventory_levels || [];
  
  const relevantLevels = inventoryLevels
    .filter(level => {
      const levelLocationId = level.location_id?.toString() || level.location_id;
      return availableLocationIds.includes(levelLocationId);
    })
    .map(level => ({
      location_id: level.location_id?.toString() || level.location_id,
      location_name: level.location_name || null,
      available: level.available || 0,
    }));
  
  const totalAvailable = relevantLevels.reduce((sum, level) => sum + level.available, 0);
  
  return {
    totalAvailable,
    locations: relevantLevels,
  };
}


