/**
 * Shopify Shipping Rates API
 * Validates shipping availability and calculates rates for a given address
 * 
 * This is critical for dropshipping - we need to verify:
 * 1. Product can be shipped to the customer's address
 * 2. Shipping costs are calculated
 * 3. Estimated delivery times are available
 */

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
        // If address1 is not provided (only country/city validation), use city as placeholder
        // This allows basic shipping validation without requiring full address
        address1: shippingAddress.address1 || shippingAddress.city || '',
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city || '',
        province: shippingAddress.province || '', // State/region (optional for most European countries)
        zip: shippingAddress.zip || '',
        country: shippingAddress.countryCode || shippingAddress.country || 'FI', // ISO 2-letter code (FI, DE, SE, etc.)
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
export async function validateCheckout({ cart, shippingAddress }) {
  // Reduced logging - details are already logged in API route
  console.log(`[API] ✅ validateCheckout: Starting - Cart items: ${cart.length}, Address: ${shippingAddress?.city || 'N/A'}, ${shippingAddress?.countryCode || shippingAddress?.country || 'N/A'}`);

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
  
  // Extract country code from shipping address for market-specific inventory checks
  // Fallback to store's primary market (Finland) if not provided
  const countryCode = shippingAddress?.countryCode || 
                      shippingAddress?.country || 
                      'FI'; // Default to Finland (primary market)
  
  // Log country code only in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] 🌍 validateCheckout: Using country code: ${countryCode}`);
  }
  
  // Run both validations in parallel
  const [inventoryValidation, shippingRates] = await Promise.all([
    validateInventory(lineItems, countryCode), // Pass countryCode for market-specific inventory
    getShippingRates({ lineItems, shippingAddress }),
  ]);
  
  console.log(`[API] ✅ validateCheckout: Complete - Inventory: ${inventoryValidation.valid}, Shipping: ${shippingRates.available}, Rates: ${shippingRates.rates?.length || 0}`);

  // Determine overall validation result
  const isValid = inventoryValidation.valid && shippingRates.available;

  return {
    valid: isValid,
    inventory: inventoryValidation,
    shipping: shippingRates,
    errors: [
      ...(inventoryValidation.valid ? [] : [inventoryValidation.error]),
      ...(shippingRates.available ? [] : [shippingRates.error]),
    ].filter(Boolean),
  };
}

