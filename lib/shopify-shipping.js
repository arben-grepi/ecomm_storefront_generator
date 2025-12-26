/**
 * Shopify Shipping Rates API
 * Validates shipping availability and calculates rates for a given address
 * 
 * This is critical for dropshipping - we need to verify:
 * 1. Product can be shipped to the customer's address
 * 2. Shipping costs are calculated
 * 3. Estimated delivery times are available
 */

import { getAdminDb, getAdminReference } from './firestore-server';
import { getCollectionPath } from './store-collections';

const SHOPIFY_API_VERSION = '2025-10';

function getShopifyCredentials() {
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Missing Shopify credentials. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.');
  }
  
  return { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN };
}

/**
 * Get shipping rates for a cart and destination address
 * This validates that products can be shipped to the address
 * 
 * Uses Shopify's Draft Order API to calculate shipping rates
 * 
 * @param {Object} params
 * @param {Array} params.lineItems - Cart items [{ variantId, quantity }]
 * @param {Object} params.shippingAddress - Destination address
 * @returns {Promise<Array>} Array of shipping rate options
 */
export async function getShippingRates({ lineItems, shippingAddress }) {
  console.log(`[API] 🚚 getShippingRates: Starting - Line items: ${lineItems.length}, Address: ${shippingAddress?.city || 'N/A'}, ${shippingAddress?.countryCode || shippingAddress?.country || 'N/A'}`);
  
  const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN } = getShopifyCredentials();

  // Use Draft Order API to get shipping rates
  // Create a temporary draft order to calculate shipping
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`;

  const draftOrderData = {
    draft_order: {
      line_items: lineItems.map(item => {
        // Draft Order API requires variant_id as a number (integer)
        const variantId = typeof item.variantId === 'string' 
          ? parseInt(item.variantId, 10) 
          : item.variantId;
        
        // Log only in development to reduce noise
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API] 🔍 getShippingRates: Processing variant: ${item.variantId} -> ${variantId}`);
        }
        
        if (!variantId || isNaN(variantId)) {
          const errorMsg = `Invalid variant ID: ${item.variantId}. Expected a number.`;
          console.error('[getShippingRates]', errorMsg);
          throw new Error(errorMsg);
        }

        return {
          variant_id: variantId,
          quantity: item.quantity,
        };
      }),
      shipping_address: {
        first_name: shippingAddress.firstName || '',
        last_name: shippingAddress.lastName || '',
        // If address1 is not provided, use a placeholder
        // This allows basic shipping validation without requiring full address
        address1: shippingAddress.address1 || 'Address',
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city || 'City',
        province: shippingAddress.province || '', // State/region (optional for most European countries)
        zip: shippingAddress.zip || '',
        country: shippingAddress.countryCode || shippingAddress.country || 'DE', // ISO 2-letter code (FI, DE, SE, etc.)
        phone: shippingAddress.phone || '',
      },
      use_customer_default_address: false,
    },
  };

  // Log draft order creation only in development (contains sensitive data)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] 📦 getShippingRates: Creating draft order for shipping calculation`);
  }

  try {
    // Create draft order to get shipping rates
    // Log URL only in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] 📡 getShippingRates: Sending request to Shopify Admin API`);
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftOrderData),
    });
    
    console.log(`[API] ✅ getShippingRates: Response received - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      // If draft order creation fails, might be due to shipping restrictions
      if (response.status === 422) {
        return {
          available: false,
          error: 'This product cannot be shipped to the selected address',
          rates: [],
        };
      }
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    const draftOrder = data.draft_order;

    // Check if draft order has shipping line (Shopify calculates it automatically)
    // If no shipping line, we need to calculate manually or it's free shipping
    const shippingLines = draftOrder.shipping_line ? [draftOrder.shipping_line] : [];
    
    // If no shipping line, check total shipping cost
    // For dropshipping, you might need to configure shipping rates in Shopify
    if (shippingLines.length === 0) {
      // Try to get shipping rates from draft order's calculated shipping
      // Some setups might not return shipping_line immediately
      // Return a default "Free Shipping" or "Shipping Calculated at Fulfillment" option
      return {
        available: true,
        rates: [
          {
            id: 'standard',
            title: 'Standard Shipping',
            price: 0,
            priceFormatted: 'Calculated at fulfillment',
            deliveryDays: null,
            deliveryDate: null,
            code: 'standard',
          },
        ],
        draftOrderId: draftOrder.id,
        note: 'Shipping will be calculated when order is fulfilled. If you see this, configure shipping rates in Shopify.',
      };
    }

    // Extract shipping rates from draft order
    const shippingRates = shippingLines.map((line, index) => ({
      id: line.code || `rate_${index}`,
      title: line.title || 'Standard Shipping',
      price: parseFloat(line.price || 0),
      priceFormatted: `$${parseFloat(line.price || 0).toFixed(2)}`,
      deliveryDays: null,
      deliveryDate: null,
      code: line.code || null,
    }));

    // Delete the temporary draft order
    try {
      await fetch(`https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/draft_orders/${draftOrder.id}.json`, {
        method: 'DELETE',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
      });
    } catch (deleteError) {
      // Ignore delete errors - it's just cleanup
      console.warn('Failed to delete temporary draft order:', deleteError);
    }

    // If no shipping rates available, product cannot be shipped to this address
    if (shippingRates.length === 0) {
      return {
        available: false,
        error: 'This product cannot be shipped to the selected address',
        rates: [],
      };
    }

    return {
      available: true,
      rates: shippingRates,
      draftOrderId: draftOrder.id,
    };
  } catch (error) {
    console.error('Failed to get shipping rates:', error);
    throw error;
  }
}

/**
 * Validate product inventory before checkout
 * Checks if all cart items are in stock for the specified market/country
 * 
 * @param {Array} lineItems - Cart items [{ variantId, quantity }]
 * @param {string} countryCode - ISO 2-letter country code (e.g., "FI", "US") for market-specific inventory
 * @returns {Promise<Object>} Validation result
 */
export async function validateInventory(lineItems, countryCode = null) {
  const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN } = getShopifyCredentials();

  // For each variant, check inventory (market-specific if countryCode provided)
  const validationResults = await Promise.all(
    lineItems.map(async (item) => {
      try {
        // Get variant details from Shopify
        const variantUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/variants/${item.variantId}.json`;
        const variantResponse = await fetch(variantUrl, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          },
        });

        if (!variantResponse.ok) {
          return {
            variantId: item.variantId,
            available: false,
            error: `Variant ${item.variantId} not found`,
            requestedQuantity: item.quantity,
            availableQuantity: 0,
          };
        }

        const variantData = await variantResponse.json();
        const variant = variantData.variant;

        // Check inventory
        const inventoryItemId = variant.inventory_item_id;
        if (!inventoryItemId) {
          return {
            variantId: item.variantId,
            available: variant.inventory_management === null, // If no inventory management, assume available
            error: variant.inventory_management === null ? null : 'Inventory tracking not configured',
            requestedQuantity: item.quantity,
            availableQuantity: variant.inventory_quantity || 0,
          };
        }

        // Get inventory levels from all locations
        const inventoryUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`;
        const inventoryResponse = await fetch(inventoryUrl, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          },
        });

        if (!inventoryResponse.ok) {
          return {
            variantId: item.variantId,
            available: false,
            error: 'Failed to check inventory',
            requestedQuantity: item.quantity,
            availableQuantity: variant.inventory_quantity || 0,
          };
        }

        const inventoryData = await inventoryResponse.json();
        const inventoryLevels = inventoryData.inventory_levels || [];

        // If countryCode provided, calculate market-specific inventory
        // Otherwise, sum all locations (backward compatibility)
        let availableQuantity = 0;
        
        if (countryCode) {
          // Import location-market-mapping dynamically to avoid circular dependencies
          const { getLocationsForMarket } = await import('@/lib/location-market-mapping');
          const availableLocations = getLocationsForMarket(countryCode);
          const availableLocationIds = availableLocations.map(loc => loc.locationId);
          
          // Sum inventory only from locations that can fulfill to this market
          availableQuantity = inventoryLevels
            .filter(level => {
              const levelLocationId = level.location_id?.toString() || level.location_id;
              return availableLocationIds.includes(levelLocationId);
            })
            .reduce((sum, level) => sum + (level.available || 0), 0);
        } else {
          // No country code - sum all locations (backward compatibility)
          availableQuantity = inventoryLevels.reduce(
            (sum, level) => sum + (level.available || 0),
            0
          ) || variant.inventory_quantity || 0;
        }

        const isAvailable = variant.inventory_policy === 'continue' || availableQuantity >= item.quantity;

        return {
          variantId: item.variantId,
          title: variant.title,
          available: isAvailable,
          requestedQuantity: item.quantity,
          availableQuantity,
          inventoryItemId: inventoryItemId ? inventoryItemId.toString() : null, // Include for stock sync
          error: isAvailable ? null : `Only ${availableQuantity} available in your region (requested ${item.quantity})`,
        };
      } catch (error) {
        console.error(`Failed to validate inventory for variant ${item.variantId}:`, error);
        return {
          variantId: item.variantId,
          available: false,
          error: error.message,
          requestedQuantity: item.quantity,
          availableQuantity: 0,
        };
      }
    })
  );

  const allAvailable = validationResults.every(result => result.available);
  const unavailableItems = validationResults.filter(result => !result.available);

  return {
    valid: allAvailable,
    items: validationResults,
    unavailableItems,
    error: allAvailable
      ? null
      : `Some items are not available: ${unavailableItems.map(i => i.title || i.variantId).join(', ')}`,
  };
}

/**
 * Full pre-checkout validation
 * Validates both inventory and shipping availability
 * 
 * @param {Object} params
 * @param {Array} params.cart - Full cart items with product info
 * @param {Object} params.shippingAddress - Destination address
 * @returns {Promise<Object>} Complete validation result
 */
export async function validateCheckout({ cart, shippingAddress, storefront: providedStorefront = null }) {
  // Reduced logging - details are already logged in API route
  console.log(`[API] ✅ validateCheckout: Starting - Cart items: ${cart.length}, Address: ${shippingAddress?.city || 'N/A'}, ${shippingAddress?.countryCode || shippingAddress?.country || 'N/A'}`);

  // Extract country code for market validation
  // Country code is optional - if not provided, we can still validate market/inventory
  // but shipping validation will need a country
  const countryCode = shippingAddress?.countryCode || shippingAddress?.country;
  
  // If no country, we can still validate market and inventory (using default market)
  // but shipping validation will fail
  const marketCountryCode = countryCode || 'DE'; // Default to DE for market/inventory checks

  // 1. Validate product market availability (use market country code, which may be default)
  console.log(`[API] 🔍 validateCheckout: Checking market availability for ${marketCountryCode}...`);
  const marketValidation = await validateMarketAvailability(cart, marketCountryCode, providedStorefront);
  
  if (!marketValidation.valid) {
    console.warn(`[API] ⚠️  Market validation failed:`, marketValidation.errors);
    // Still run inventory/shipping checks to provide complete feedback
  }

  // Validate that all cart items have shopifyVariantId
  // If missing, this is a data issue that needs to be fixed at the source
  const itemsMissingShopifyId = cart.filter(item => !item.shopifyVariantId);
  if (itemsMissingShopifyId.length > 0) {
    const itemNames = itemsMissingShopifyId.map(item => item.productName || item.productId).join(', ');
    throw new Error(
      `Missing Shopify variant IDs for products: ${itemNames}. ` +
      `Please reprocess these products from the admin panel to sync their Shopify IDs.`
    );
  }

  // Transform cart to line items for API calls
  // Ensure variant IDs are resolved to Shopify variant IDs (numbers)
  const lineItems = cart.map(item => {
    // Use shopifyVariantId if available, otherwise use variantId
    const variantId = item.shopifyVariantId || item.variantId;
    
    // Log item processing only in development (redundant with API route logs)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] 🔍 validateCheckout: Processing item ${item.productName || item.productId}`);
    }
    
    // Ensure it's a number (Shopify variant IDs are numbers)
    const numericVariantId = typeof variantId === 'string' 
      ? parseInt(variantId, 10) 
      : variantId;
    
    if (!numericVariantId || isNaN(numericVariantId)) {
      const errorMsg = `Invalid variant ID for cart item: ${item.productName || item.productId}. Variant ID: ${variantId}, Shopify Variant ID: ${item.shopifyVariantId || 'missing'}. Please remove this item from cart and add it again.`;
      console.error('[validateCheckout]', errorMsg);
      throw new Error(errorMsg);
    }

    return {
      variantId: numericVariantId,
      quantity: item.quantity,
    };
  }).filter(item => item.variantId);

  // Log transformed items only in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] 🔄 validateCheckout: Transformed to ${lineItems.length} line item(s)`);
  }

  if (lineItems.length === 0) {
    throw new Error('No valid line items found. Cart items may be missing Shopify variant IDs.');
  }

  console.log(`[API] 🔍 validateCheckout: Running inventory and shipping validation in parallel...`);
  
  // Run inventory and shipping validations in parallel
  // Note: Shipping validation requires country, but inventory can use default market
  const [inventoryValidation, shippingRates] = await Promise.all([
    validateInventory(lineItems, marketCountryCode), // Pass marketCountryCode for market-specific inventory
    countryCode ? getShippingRates({ lineItems, shippingAddress }) : Promise.resolve({ available: false, error: 'Country is required for shipping validation', rates: [] }),
  ]);
  
  console.log(`[API] ✅ validateCheckout: Complete - Market: ${marketValidation.valid}, Inventory: ${inventoryValidation.valid}, Shipping: ${shippingRates.available}, Rates: ${shippingRates.rates?.length || 0}`);

  // Self-healing: If inventory validation failed, sync stock from Shopify for unavailable variants
  // This ensures database stays in sync even when webhooks were disabled or missed updates
  // When stock appears again in Shopify, this will detect and sync it
  // IMPORTANT: Run this in background (don't await) so user gets immediate feedback
  if (!inventoryValidation.valid && inventoryValidation.unavailableItems && inventoryValidation.unavailableItems.length > 0) {
    const unavailableVariantIds = inventoryValidation.unavailableItems
      .map(item => item.variantId)
      .filter(id => id); // Only sync variants with IDs
    
    if (unavailableVariantIds.length > 0) {
      console.log(`[API] 🔄 Inventory validation failed - will sync stock for ${unavailableVariantIds.length} variant(s) in background...`);
      
      // Run sync in background (fire and forget) - don't block response
      (async () => {
        try {
          const { syncStockForVariant } = await import('@/lib/sync-stock-on-validation');
          
          // Create a map of variantId -> inventoryItemId from validation results
          const variantToInventoryItemMap = new Map();
          inventoryValidation.unavailableItems.forEach(item => {
            if (item.variantId && item.inventoryItemId) {
              variantToInventoryItemMap.set(item.variantId, item.inventoryItemId);
            }
          });
          
          const syncPromises = unavailableVariantIds.map(variantId => {
            const inventoryItemId = variantToInventoryItemMap.get(variantId);
            return syncStockForVariant(variantId, inventoryItemId || null).catch(error => {
              console.warn(`[API] ⚠️  Failed to sync stock for variant ${variantId}:`, error.message || error);
              return { success: false, variantId: variantId.toString(), error: error.message || error.toString() };
            });
          });
          
          const syncResults = await Promise.all(syncPromises);
          const successfulSyncs = syncResults.filter(r => r && r.success).length;
          
          console.log(`[API] ✅ Background stock sync complete - ${successfulSyncs}/${syncResults.length} variants synced successfully`);
          
          syncResults.filter(r => r && r.success).forEach(result => {
            if (result.deleted) {
              const variantId = result.inventoryItemId || result.shopifyProductId || 'unknown';
              console.log(`[API] 🗑️  Deleted variant ${variantId}: removed ${result.deletedVariants || 0} variant(s), ${result.deletedProducts || 0} product(s)`);
              if (result.note) {
                console.log(`[API]    Note: ${result.note}`);
              }
            } else {
              const variantId = result.inventoryItemId || 'unknown';
              console.log(`[API] ✅ Synced variant ${variantId}: ${result.totalAvailable || 0} available`);
            }
          });
        } catch (syncError) {
          console.error(`[API] ⚠️  Background stock sync failed:`, syncError);
        }
      })(); // Fire and forget - don't await
    }
  }

  // Create a map from Shopify variant ID to cart item for easy lookup
  const variantToCartItemMap = new Map();
  cart.forEach(item => {
    const variantId = item.shopifyVariantId || item.variantId;
    const numericVariantId = typeof variantId === 'string' ? parseInt(variantId, 10) : variantId;
    if (numericVariantId && !isNaN(numericVariantId)) {
      variantToCartItemMap.set(numericVariantId, item);
    }
  });

  // Map unavailable inventory items to cart items with product names
  const unavailableInventoryItems = inventoryValidation.unavailableItems || [];
  const unavailableInventoryItemsWithNames = unavailableInventoryItems.map(item => {
    const cartItem = variantToCartItemMap.get(item.variantId);
    return {
      ...item,
      productName: cartItem?.productName || item.title || `Variant ${item.variantId}`,
      variantName: cartItem?.variantName,
      productId: cartItem?.productId,
      variantId: cartItem?.variantId, // Firestore variant ID
      shopifyVariantId: item.variantId, // Shopify variant ID
    };
  });

  // Map unavailable market products (already have product names from validateMarketAvailability)
  const unavailableMarketProducts = marketValidation.unavailableProducts || [];

  // Combine all unavailable items
  const allUnavailableItems = [
    ...unavailableMarketProducts.map(item => ({
      productName: item.productName || item.productId,
      productId: item.productId,
      reason: item.reason || 'Not available in selected market',
      type: 'market',
    })),
    ...unavailableInventoryItemsWithNames.map(item => ({
      productName: item.productName,
      productId: item.productId,
      variantId: item.variantId,
      shopifyVariantId: item.shopifyVariantId,
      reason: item.error || 'Not available',
      type: 'inventory',
    })),
  ];

  // Determine overall validation result (all must pass)
  const isValid = marketValidation.valid && inventoryValidation.valid && shippingRates.available;

  // Build user-friendly error messages with product names
  const allErrors = [];
  
  // Market validation errors - already include product names
  if (!marketValidation.valid) {
    if (marketValidation.errors && Array.isArray(marketValidation.errors) && marketValidation.errors.length > 0) {
      allErrors.push(...marketValidation.errors);
    } else if (marketValidation.error) {
      allErrors.push(marketValidation.error);
    }
  }
  
  // Inventory validation errors - update to use product names
  if (!inventoryValidation.valid) {
    if (unavailableInventoryItemsWithNames.length > 0) {
      const productNames = unavailableInventoryItemsWithNames
        .map(item => item.productName)
        .filter((name, index, arr) => arr.indexOf(name) === index); // Remove duplicates
      allErrors.push(`Some items are not available: ${productNames.join(', ')}`);
    } else if (inventoryValidation.error) {
      allErrors.push(inventoryValidation.error);
    }
  }
  
  // Shipping validation errors - check if we can identify which products can't be shipped
  if (!shippingRates.available && shippingRates.error) {
    // If shipping failed for all items or we can't determine specific items, use generic error
    // Otherwise, try to identify which items caused the issue
    if (shippingRates.unavailableItems && shippingRates.unavailableItems.length > 0) {
      const productNames = shippingRates.unavailableItems
        .map(item => {
          const cartItem = variantToCartItemMap.get(item.variantId);
          return cartItem?.productName || `Variant ${item.variantId}`;
        })
        .filter((name, index, arr) => arr.indexOf(name) === index);
      allErrors.push(`These products cannot be shipped to the selected address: ${productNames.join(', ')}`);
    } else {
      allErrors.push(shippingRates.error);
    }
  }

  return {
    valid: isValid,
    market: marketValidation,
    inventory: {
      ...inventoryValidation,
      unavailableItems: unavailableInventoryItemsWithNames,
    },
    shipping: shippingRates,
    errors: allErrors.filter(Boolean),
    unavailableItems: allUnavailableItems, // Complete list of unavailable items for UI display
  };
}

/**
 * Validate that all products in cart are available in the selected market
 */
async function validateMarketAvailability(cart, countryCode, providedStorefront = null) {
  const db = getAdminDb();
  if (!db) {
    return {
      valid: false,
      error: 'Server configuration error',
      errors: ['Firebase Admin not initialized'],
    };
  }

  // Get storefront from parameter, cart items, or default
  // Priority: providedStorefront > cart item storefront > default LUNERA
  let storefront = providedStorefront || cart[0]?.storefront || 'LUNERA';
  console.log(`[API] 🔍 validateMarketAvailability: Using storefront: ${storefront} (provided: ${providedStorefront}, cart: ${cart[0]?.storefront})`);
  
  // If storefront is not in cart item, try to find the product in all storefronts
  // This handles cases where storefront wasn't saved with the cart item
  const unavailableProducts = [];
  
  for (const item of cart) {
    try {
      // Use item's storefront if available, otherwise try to determine from product
      const itemStorefront = item.storefront || storefront;
      const productsPath = getCollectionPath('products', itemStorefront);
      const productRef = getAdminReference(db, [...productsPath, item.productId]);
      let productDoc = await productRef.get();
      
      // If not found, try other storefronts (LUNERA, HEALTH, FIVESTARFINDS, etc.)
      if (!productDoc.exists) {
        const commonStorefronts = ['LUNERA', 'HEALTH', 'FIVESTARFINDS', 'GIFTSHOP'];
        for (const sf of commonStorefronts) {
          if (sf === itemStorefront) continue; // Already tried
          const tryPath = getCollectionPath('products', sf);
          const tryRef = getAdminReference(db, [...tryPath, item.productId]);
          const tryDoc = await tryRef.get();
          if (tryDoc.exists) {
            productDoc = tryDoc;
            storefront = sf; // Update storefront for subsequent items
            console.log(`[API] 🔍 Product ${item.productId} found in storefront ${sf} (not ${itemStorefront})`);
            break;
          }
        }
      }
      
      if (!productDoc.exists) {
        unavailableProducts.push({
          productId: item.productId,
          productName: item.productName || item.productId,
          reason: 'Product not found in any storefront'
        });
        continue;
      }

      const productData = productDoc.data();
      
      // Check if product is available in the selected market
      let isAvailableInMarket = false;
      let availabilityReason = '';
      
      if (productData.marketsObject && typeof productData.marketsObject === 'object') {
        const marketData = productData.marketsObject[countryCode];
        if (marketData) {
          isAvailableInMarket = marketData.available !== false;
          availabilityReason = marketData.available === false 
            ? `marketsObject[${countryCode}].available is explicitly false`
            : `marketsObject[${countryCode}] exists and available !== false`;
        } else {
          availabilityReason = `No marketsObject entry for ${countryCode}. Available markets: ${Object.keys(productData.marketsObject || {}).join(', ')}`;
        }
      } else if (productData.markets && Array.isArray(productData.markets)) {
        isAvailableInMarket = productData.markets.includes(countryCode);
        availabilityReason = isAvailableInMarket 
          ? `Found in markets array`
          : `Not in markets array. Available markets: ${productData.markets.join(', ')}`;
      } else {
        availabilityReason = `Product has no marketsObject or markets array`;
      }

      console.log(`[API] 🔍 Product ${item.productId} (${item.productName || productData.name || 'N/A'}) availability check for ${countryCode}:`, {
        isAvailableInMarket,
        hasMarketsObject: !!productData.marketsObject,
        hasMarketsArray: !!productData.markets,
        marketsObjectKeys: productData.marketsObject ? Object.keys(productData.marketsObject) : null,
        marketsArray: productData.markets || null,
        reason: availabilityReason
      });

      if (!isAvailableInMarket) {
        unavailableProducts.push({
          productId: item.productId,
          productName: item.productName || productData.name || item.productId,
          reason: `Product is not available in ${countryCode}: ${availabilityReason}`
        });
      }
    } catch (error) {
      console.error(`[API] ❌ Error checking product ${item.productId}:`, error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      unavailableProducts.push({
        productId: item.productId,
        productName: item.productName || item.productId,
        reason: `Error checking product availability: ${errorMessage}`
      });
    }
  }

  if (unavailableProducts.length > 0) {
    console.error(`[API] ❌ ${unavailableProducts.length} product(s) not available in market ${countryCode}:`, unavailableProducts);
    return {
      valid: false,
      error: 'Some products are not available in the selected country',
      errors: unavailableProducts.map(p => `${p.productName} is not available in ${countryCode}${p.reason ? `: ${p.reason}` : ''}`),
      unavailableProducts,
    };
  }

  console.log(`[API] ✅ All products are available in market ${countryCode}`);
  return {
    valid: true,
    errors: [],
  };
}

