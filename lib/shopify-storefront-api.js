/**
 * Shopify Storefront API client
 * Used for creating checkouts that redirect to Shopify's hosted checkout
 * 
 * Note: This runs server-side only (in API routes)
 * Storefront API token is different from Admin API token
 */

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE_URL;
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2025-10';

function getStorefrontCredentials() {
  const storeDomain = SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  
  if (!storeDomain || !accessToken) {
    throw new Error('Missing Storefront API credentials. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN.');
  }
  
  return { storeDomain, accessToken };
}

/**
 * Make a GraphQL request to Shopify Storefront API
 */
async function storefrontRequest(query, variables = {}) {
  const { storeDomain, accessToken } = getStorefrontCredentials();
  
  const url = `https://${storeDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Storefront-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify Storefront API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Shopify Storefront API GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

/**
 * Verify if variants are accessible in Storefront API before checkout
 * This checks if variants are indexed and availableForSale
 * @param {Array<string|number>} variantIds - Array of variant IDs (numeric or GID format)
 * @returns {Promise<Object>} { accessible: boolean, accessibleVariants: Array, inaccessibleVariants: Array }
 */
export async function verifyStorefrontVariantAccessibility(variantIds) {
  if (!variantIds || variantIds.length === 0) {
    return { accessible: false, accessibleVariants: [], inaccessibleVariants: [] };
  }

  // Convert variant IDs to GID format
  const variantGids = variantIds.map(id => {
    if (typeof id === 'string' && id.startsWith('gid://shopify/ProductVariant/')) {
      return id;
    }
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    return `gid://shopify/ProductVariant/${numericId}`;
  });

  const query = `
    query checkVariants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          title
          availableForSale
          product {
            id
            title
            availableForSale
          }
        }
      }
    }
  `;

  try {
    const data = await storefrontRequest(query, { ids: variantGids });
    
    const accessibleVariants = [];
    const inaccessibleVariants = [];

    (data.nodes || []).forEach((node, index) => {
      const originalId = variantIds[index];
      
      if (!node) {
        // Variant not found in Storefront API (not indexed)
        inaccessibleVariants.push({
          variantId: originalId,
          reason: 'not_indexed',
          message: 'Variant is not yet indexed in Storefront API. This typically takes 30-60 seconds after product publication.',
        });
      } else if (node.availableForSale && node.product?.availableForSale) {
        // Variant is accessible
        accessibleVariants.push({
          variantId: originalId,
          variantGid: node.id,
          title: node.title,
          productTitle: node.product?.title,
        });
      } else {
        // Variant exists but not available for sale
        inaccessibleVariants.push({
          variantId: originalId,
          variantGid: node.id,
          reason: 'not_available',
          message: `Variant "${node.title}" exists but is not available for sale. Product: ${node.product?.title || 'Unknown'}`,
        });
      }
    });

    return {
      accessible: inaccessibleVariants.length === 0,
      accessibleVariants,
      inaccessibleVariants,
    };
  } catch (error) {
    console.error(`[API] ❌ Storefront API: Failed to verify variant accessibility:`, error);
    // On error, assume variants are not accessible
    return {
      accessible: false,
      accessibleVariants: [],
      inaccessibleVariants: variantIds.map(id => ({
        variantId: id,
        reason: 'verification_failed',
        message: `Failed to verify variant accessibility: ${error.message}`,
      })),
    };
  }
}

/**
 * Create a cart via Storefront API (replaces deprecated checkoutCreate)
 * Returns cart with checkout URL that redirects to Shopify's hosted checkout
 * 
 * Note: Shipping rates are NOT available via Cart API - they're shown on Shopify's checkout page
 * 
 * @param {Object} params
 * @param {Array} params.lineItems - Cart items [{ variantId, quantity }]
 * @param {String} params.market - Market code (e.g., "FI", "DE")
 * @param {String} params.storefront - Storefront name (e.g., "LUNERA")
 * @param {Array} params.customAttributes - Additional custom attributes
 * @returns {Promise<Object>} { cartId, checkoutUrl }
 */
export async function createCart({
  lineItems,
  market = 'DE',
  storefront,
  customAttributes = [],
}) {
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('Line items are required');
  }

  if (!storefront) {
    throw new Error('Storefront name is required');
  }

  // Build custom attributes array
  const attributes = [
    { key: 'storefront_market', value: market },
    { key: 'storefront_name', value: storefront },
    ...customAttributes,
  ];

  // Build line items for GraphQL
  // Storefront API requires Global IDs (GIDs) format: gid://shopify/ProductVariant/{id}
  const cartLines = lineItems.map((item) => {
    // Ensure variantId is in GID format
    let merchandiseId = item.variantId;
    
    // If it's a number or string number, convert to GID
    if (typeof merchandiseId === 'number' || (typeof merchandiseId === 'string' && /^\d+$/.test(merchandiseId))) {
      const variantIdNumber = typeof merchandiseId === 'string' 
        ? parseInt(merchandiseId, 10) 
        : merchandiseId;
      
      if (!variantIdNumber || isNaN(variantIdNumber)) {
        throw new Error(`Invalid Shopify variant ID: ${item.variantId}`);
      }
      
      merchandiseId = `gid://shopify/ProductVariant/${variantIdNumber}`;
    }
    
    // If already in GID format, use as-is
    if (!merchandiseId.startsWith('gid://shopify/ProductVariant/')) {
      throw new Error(`Invalid Shopify variant ID format: ${item.variantId}. Expected GID format or numeric ID.`);
    }

    return {
      merchandiseId,
      quantity: item.quantity,
    };
  });

  const mutation = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          lines(first: 50) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    priceV2 {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
          cost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
          }
          attributes {
            key
            value
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    input: {
      lines: cartLines,
      attributes: attributes,
      buyerIdentity: {
        countryCode: market, // Set market/country code
      },
    },
  };

  try {
    console.log(`[API] 🛒 Storefront API: Creating cart - Storefront: ${storefront}, Line Items: ${lineItems.length}, Market: ${market}`);
    const data = await storefrontRequest(mutation, variables);
    const { cart, userErrors } = data.cartCreate;

    if (userErrors && userErrors.length > 0) {
      const errors = userErrors.map(err => `${err.field}: ${err.message}`).join(', ');
      console.error(`[API] ❌ Storefront API: Cart creation errors: ${errors}`);
      throw new Error(`Cart creation errors: ${errors}`);
    }

    if (!cart || !cart.checkoutUrl) {
      console.error(`[API] ❌ Storefront API: Failed to create cart: No checkout URL returned`);
      throw new Error('Failed to create cart: No checkout URL returned');
    }

    // Extract cart ID (remove "gid://shopify/Cart/" prefix)
    const cartId = cart.id.replace('gid://shopify/Cart/', '');
    
    console.log(`[API] ✅ Storefront API: Cart created successfully - ID: ${cartId}`);

    return {
      cartId,
      checkoutUrl: cart.checkoutUrl,
      // Note: Shipping rates not available via Cart API - shown on checkout page
    };
  } catch (error) {
    console.error(`[API] ❌ Storefront API: Failed to create cart:`, error.message || error);
    throw error;
  }
}

/**
 * Update cart with buyer identity (shipping address)
 * Use this to set shipping address before redirecting to checkout
 * 
 * @param {string} cartId - Cart GID format: gid://shopify/Cart/{id}
 * @param {Object} shippingAddress - Shipping address
 * @param {string} market - Market code (e.g., "FI", "DE")
 * @returns {Promise<Object>} Updated cart
 */
export async function updateCartBuyerIdentity(cartId, shippingAddress, market = 'DE') {
  // Ensure cartId is in GID format
  const cartGid = cartId.startsWith('gid://shopify/Cart/')
    ? cartId
    : `gid://shopify/Cart/${cartId}`;

  const mutation = `
    mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
      cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
        cart {
          id
          checkoutUrl
          buyerIdentity {
            countryCode
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    cartId: cartGid,
    buyerIdentity: {
      countryCode: market,
      deliveryAddressPreferences: [
        {
          deliveryAddress: {
            address1: shippingAddress.address1 || '',
            address2: shippingAddress.address2 || '',
            city: shippingAddress.city || '',
            country: market,
            zip: shippingAddress.zip || '',
            firstName: shippingAddress.firstName || '',
            lastName: shippingAddress.lastName || '',
            phone: shippingAddress.phone || '',
          },
        },
      ],
    },
  };

  try {
    console.log(`[API] 🔄 Storefront API: Updating cart buyer identity - Market: ${market}`);
    const data = await storefrontRequest(mutation, variables);
    const { cart, userErrors } = data.cartBuyerIdentityUpdate;

    if (userErrors && userErrors.length > 0) {
      const errors = userErrors.map(err => `${err.field}: ${err.message}`).join(', ');
      console.error(`[API] ❌ Storefront API: Cart buyer identity update errors: ${errors}`);
      throw new Error(`Cart buyer identity update errors: ${errors}`);
    }

    if (!cart) {
      console.error(`[API] ❌ Storefront API: Failed to update cart buyer identity: No cart returned`);
      throw new Error('Failed to update cart buyer identity: No cart returned');
    }

    console.log(`[API] ✅ Storefront API: Cart buyer identity updated successfully`);
    return cart;
  } catch (error) {
    console.error(`[API] ❌ Storefront API: Failed to update cart buyer identity:`, error.message || error);
    throw error;
  }
}

/**
 * Legacy function name - for backward compatibility
 * @deprecated Use createCart instead
 */
export async function createCheckout({
  lineItems,
  shippingAddress,
  storefront,
  customAttributes = [],
}) {
  // Extract market from shipping address or default to FI
  const market = shippingAddress?.countryCode || shippingAddress?.country || 'DE';
  
  console.warn('[Storefront API] createCheckout is deprecated, use createCart instead');
  
  // Create cart first
  const cart = await createCart({
    lineItems,
    market,
    storefront,
    customAttributes,
  });
  
  // If shipping address provided, update cart buyer identity
  if (shippingAddress && shippingAddress.address1 && shippingAddress.city) {
    try {
      const updatedCart = await updateCartBuyerIdentity(cart.cartId, shippingAddress, market);
      return {
        cartId: cart.cartId,
        checkoutId: cart.cartId, // For backward compatibility
        checkoutUrl: updatedCart.checkoutUrl,
      };
    } catch (error) {
      console.warn('[Storefront API] Failed to update buyer identity, using cart without address:', error.message);
    }
  }
  
  return {
    cartId: cart.cartId,
    checkoutId: cart.cartId, // For backward compatibility
    checkoutUrl: cart.checkoutUrl,
    // Note: shippingRates not available in Cart API
    shippingRates: [],
  };
}

/**
 * @deprecated Shipping rates are NOT available via Cart API
 * They are shown on Shopify's hosted checkout page
 * Use this only if you need to query a legacy checkout
 */
export async function getCheckoutShippingRates(checkoutId) {
  console.warn('[Storefront API] getCheckoutShippingRates is deprecated - shipping rates not available via Cart API');
  return [];
}

/**
 * @deprecated Checkout shipping updates not available via Cart API
 * Shipping is selected on Shopify's hosted checkout page
 * Use this only if you need to update a legacy checkout
 */
export async function updateCheckoutShipping(checkoutId, shippingRateHandle) {
  console.warn('[Storefront API] updateCheckoutShipping is deprecated - shipping selection happens on checkout page');
  throw new Error('Shipping updates not available via Cart API - shipping is selected on Shopify checkout page');
}

/**
 * Fetch products for a specific market using @inContext directive
 * This returns market-specific pricing, availability, and currency
 * 
 * @param {string} market - Market code (e.g., "FI", "DE")
 * @param {number} first - Number of products to fetch (default: 50)
 * @returns {Promise<Object>} Products data from Storefront API
 */
export async function fetchProductsForMarket(market = 'DE', first = 50) {
  const query = `
    query ($country: CountryCode!, $first: Int!) @inContext(country: $country) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            availableForSale
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
            images(first: 5) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  
  const variables = {
    country: market, // "FI" or "DE"
    first: first
  };
  
  try {
    console.log(`[Storefront API] Fetching products for market: ${market}`);
    const data = await storefrontRequest(query, variables);
    console.log(`[Storefront API] Fetched ${data.products?.edges?.length || 0} products for ${market}`);
    return data.products;
  } catch (error) {
    console.error(`[Storefront API] Failed to fetch products for market ${market}:`, error.message || error);
    throw error;
  }
}

/**
 * Fetch a specific product by ID for a market using @inContext
 * 
 * @param {string} productId - Product GID (e.g., "gid://shopify/Product/123")
 * @param {string} market - Market code (e.g., "FI", "DE")
 * @returns {Promise<Object>} Product data from Storefront API
 */
export async function fetchProductForMarket(productId, market = 'DE') {
  // Ensure productId is in GID format
  const productGid = productId.startsWith('gid://shopify/Product/')
    ? productId
    : `gid://shopify/Product/${productId}`;
  
  const query = `
    query ($id: ID!, $country: CountryCode!) @inContext(country: $country) {
      product(id: $id) {
        id
        title
        handle
        availableForSale
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
              availableForSale
              price {
                amount
                currencyCode
              }
            }
          }
        }
        images(first: 5) {
          edges {
            node {
              url
              altText
            }
          }
        }
      }
    }
  `;
  
  const variables = {
    id: productGid,
    country: market
  };
  
  try {
    const data = await storefrontRequest(query, variables);
    return data.product;
  } catch (error) {
    console.error(`[Storefront API] Failed to fetch product ${productId} for market ${market}:`, error.message || error);
    throw error;
  }
}

/**
 * @deprecated Checkout API is deprecated - use Cart API instead
 * Use this only if you need to query a legacy checkout
 */
export async function getCheckout(checkoutId) {
  console.warn('[Storefront API] getCheckout is deprecated - use Cart API instead');
  throw new Error('Checkout API is deprecated - use Cart API instead');
}

