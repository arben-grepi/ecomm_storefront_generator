#!/usr/bin/env node

// Load environment variables from .env.local automatically
require('dotenv').config({ path: '.env.local' });

/**
 * Import products from Shopify API and match them to categories.
 * 
 * IMPORTANT: Products must be published to "Blerinas" catalog
 * Storefront API token (SHOPIFY_STOREFRONT_ACCESS_TOKEN) is scoped to "Blerinas" publication
 * 
 * This script:
 * 1. Fetches products from Shopify Admin API
 * 2. Fetches inventory levels for each variant
 * 3. Matches products to categories using tags, product type, and keywords
 * 4. Imports matching products into Firestore with inventory data
 * 5. Verifies products are accessible via Storefront API (must be published to "Blerinas" catalog)
 *
 * Environment variables (from .env.local):
 *
 * SHOPIFY_STORE_URL=your-store.myshopify.com
 * SHOPIFY_ACCESS_TOKEN=your_access_token
 * SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_token (MUST be scoped to "Online Store")
 *
 * Optional Firebase (if not using ADC):
 * FIREBASE_PROJECT_ID=ecom-store-generator-41064
 * FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ecom-store-generator-41064.iam.gserviceaccount.com
 * FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *
 * Usage:
 *   node scripts/import-shopify-products.js
 */

const admin = require('firebase-admin');

const DEFAULT_PROJECT_ID = 'ecom-store-generator-41064';

// Category matching configuration
const CATEGORY_MATCHING = {
  lingerie: {
    keywords: ['lingerie', 'bra', 'bralette', 'bra set', 'corset', 'bustier', 'teddy', 'bodysuit', 'garter', 'stockings', 'thong', 'panties set', 'matching set'],
    productTypes: ['lingerie', 'bra', 'bralette', 'underwear set'],
    tags: ['lingerie', 'bra', 'bralette', 'matching set'],
  },
  underwear: {
    keywords: ['underwear', 'panties', 'brief', 'thong', 'g-string', 'boy short', 'hipster', 'bikini', 'underwear set'],
    productTypes: ['underwear', 'panties', 'briefs', 'thong'],
    tags: ['underwear', 'panties', 'briefs', 'thong'],
  },
  sports: {
    keywords: ['sport', 'activewear', 'athletic', 'yoga', 'gym', 'workout', 'fitness', 'running', 'leggings', 'sports bra', 'athletic wear'],
    productTypes: ['activewear', 'sportswear', 'athletic', 'yoga wear'],
    tags: ['sport', 'activewear', 'athletic', 'yoga', 'fitness'],
  },
  dresses: {
    keywords: ['dress', 'gown', 'frock', 'evening dress', 'cocktail dress', 'maxi dress', 'midi dress', 'mini dress'],
    productTypes: ['dress', 'gown', 'evening wear'],
    tags: ['dress', 'gown', 'evening'],
  },
  clothes: {
    keywords: ['top', 'shirt', 'blouse', 'sweater', 'cardigan', 'jacket', 'coat', 'pants', 'trousers', 'skirt', 'shorts', 'jumpsuit', 'romper'],
    productTypes: ['top', 'shirt', 'blouse', 'sweater', 'jacket', 'pants', 'skirt'],
    tags: ['clothing', 'apparel', 'fashion'],
  },
};

function initializeAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    admin.initializeApp({
      projectId: DEFAULT_PROJECT_ID,
    });
  }

  return admin.app();
}

const db = initializeAdmin().firestore();
const FieldValue = admin.firestore.FieldValue;

const slugify = (value) =>
  value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const generateDocumentId = (product) => {
  if (product.handle) {
    return slugify(product.handle);
  }
  if (product.title) {
    const slug = slugify(product.title);
    if (slug) return slug;
  }
  return `shopify-product-${product.id}`;
};

const extractImageUrls = (product) =>
  (product.images || [])
    .map((img) => (typeof img === 'object' ? img.src : img))
    .filter(Boolean);

/**
 * Fetch inventory levels for multiple inventory items using GraphQL (batch query)
 * This reduces API calls from N (one per variant) to 1 per product
 */
async function fetchInventoryLevelsBulk(storeUrl, accessToken, inventoryItemIds) {
  if (!inventoryItemIds || inventoryItemIds.length === 0) {
    return {};
  }

  // Filter out null/undefined IDs and convert to GID format
  const validItemIds = inventoryItemIds
    .filter(id => id)
    .map(id => {
      const idStr = id.toString();
      return idStr.startsWith('gid://shopify/InventoryItem/') 
        ? idStr 
        : `gid://shopify/InventoryItem/${idStr}`;
    });

  if (validItemIds.length === 0) {
    return {};
  }

  // GraphQL query to fetch inventory levels for multiple items in one call
  // Note: Shopify GraphQL has limits, so we batch in chunks of 50
  const BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < validItemIds.length; i += BATCH_SIZE) {
    batches.push(validItemIds.slice(i, i + BATCH_SIZE));
  }

  const inventoryMap = {};

  for (const batch of batches) {
    try {
      // Build GraphQL query for this batch
      // Note: 'available' is accessed via quantities(names: ["available"])
      const query = `
        query getInventoryLevels($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on InventoryItem {
              id
              inventoryLevels(first: 10) {
                edges {
                  node {
                    id
                    location {
                      id
                      name
                    }
                    quantities(names: ["available"]) {
                      name
                      quantity
                    }
                    updatedAt
                  }
                }
              }
            }
          }
        }
      `;

      const url = `https://${storeUrl}/admin/api/2025-10/graphql.json`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { ids: batch },
        }),
      });

      if (!response.ok) {
        console.warn(`  ⚠️  Failed to fetch inventory batch (${batch.length} items): ${response.status}`);
        // Fallback: return empty data for this batch
        batch.forEach(id => {
          const originalId = id.replace('gid://shopify/InventoryItem/', '');
          inventoryMap[originalId] = [];
        });
        continue;
      }

      const data = await response.json();
      
      if (data.errors) {
        console.warn(`  ⚠️  GraphQL errors fetching inventory batch:`, data.errors);
        // Fallback: return empty data for this batch
        batch.forEach(id => {
          const originalId = id.replace('gid://shopify/InventoryItem/', '');
          inventoryMap[originalId] = [];
        });
        continue;
      }

      // Map results back to inventory item IDs
      const nodes = data.data?.nodes || [];
      nodes.forEach((node, index) => {
        if (!node || !node.inventoryLevels) return;
        
        const originalId = batch[index].replace('gid://shopify/InventoryItem/', '');
        const levels = node.inventoryLevels.edges.map(edge => {
          // Extract available quantity from quantities array
          const availableQuantity = edge.node.quantities?.find(q => q.name === 'available')?.quantity ?? 0;
          
          return {
            location_id: edge.node.location?.id?.replace('gid://shopify/Location/', '') || null,
            location_name: edge.node.location?.name || null,
            available: availableQuantity,
            updated_at: edge.node.updatedAt || new Date().toISOString(),
          };
        });
        
        inventoryMap[originalId] = levels;
      });

      // Rate limiting: wait 500ms between batches (stays under 2 req/sec)
      if (batches.length > 1 && batch !== batches[batches.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.warn(`  ⚠️  Error fetching inventory batch:`, error.message);
      // Fallback: return empty data for this batch
      batch.forEach(id => {
        const originalId = id.replace('gid://shopify/InventoryItem/', '');
        inventoryMap[originalId] = [];
      });
    }
  }

  return inventoryMap;
}

/**
 * Enrich product variants with inventory data using batched GraphQL queries
 * This fetches all inventory levels for all variants in a product in a single API call
 */
async function enrichProductWithInventory(storeUrl, accessToken, product) {
  if (!product.variants || product.variants.length === 0) {
    return product;
  }

  // Collect all inventory item IDs from variants
  const inventoryItemIds = product.variants
    .map(v => v.inventory_item_id)
    .filter(id => id);

  // Fetch all inventory levels in one batch query (or a few if >50 variants)
  const inventoryMap = inventoryItemIds.length > 0
    ? await fetchInventoryLevelsBulk(storeUrl, accessToken, inventoryItemIds)
    : {};

  // Enrich variants with inventory data
  // IMPORTANT: Preserve variant.title - this is used by ProductModal to extract variantName (e.g., "White / M / 1pc")
  const enrichedVariants = product.variants.map(variant => {
    const inventoryItemId = variant.inventory_item_id;
    
    if (inventoryItemId && inventoryMap[inventoryItemId.toString()]) {
      const locationInventoryLevels = inventoryMap[inventoryItemId.toString()];
      
      // Calculate total for backward compatibility
      const totalAvailable = locationInventoryLevels.reduce((sum, level) => {
        return sum + (level.available || 0);
      }, 0);
      
      return {
        ...variant,
        title: variant.title, // PRESERVE: Used by ProductModal to extract variantName (e.g., "White / M / 1pc")
        inventory_levels: locationInventoryLevels, // Store location-specific inventory
        inventory_quantity: totalAvailable, // Keep for backward compatibility
        inventoryQuantity: totalAvailable, // Keep for backward compatibility
        inventory_quantity_total: totalAvailable, // Explicit total field
        inventory_policy: variant.inventory_policy || 'deny', // 'continue' or 'deny'
        available: totalAvailable > 0 || variant.inventory_policy === 'continue',
      };
    } else {
      // No inventory item ID or no inventory data found
      return {
        ...variant,
        title: variant.title, // PRESERVE: Used by ProductModal to extract variantName (e.g., "White / M / 1pc")
        inventory_quantity: 0,
        inventoryQuantity: 0,
        inventory_levels: [],
        inventory_policy: variant.inventory_policy || 'deny',
        available: false,
      };
    }
  });
  
  // Calculate product-level stock status
  // Product has in-stock variants if:
  // 1. Any variant has inventory_quantity > 0, OR
  // 2. Any variant has inventory_policy === 'continue' (dropship/backorder allowed)
  const hasInStockVariants = enrichedVariants.some(variant => {
    const hasStock = (variant.inventory_quantity || 0) > 0;
    const allowsBackorder = variant.inventory_policy === 'continue';
    return hasStock || allowsBackorder;
  });
  
  const inStockVariantCount = enrichedVariants.filter(variant => {
    const hasStock = (variant.inventory_quantity || 0) > 0;
    const allowsBackorder = variant.inventory_policy === 'continue';
    return hasStock || allowsBackorder;
  }).length;

  return {
    ...product,
    variants: enrichedVariants,
    hasInStockVariants, // Product-level flag: true if at least one variant is available
    inStockVariantCount, // Count of in-stock variants
    totalVariantCount: enrichedVariants.length,
  };
}

/**
 * Query product markets and Blerinas catalog publication status from Shopify Admin GraphQL API
 * Note: We use Blerinas catalog because our Storefront API token is scoped to it
 */
async function getProductMarkets(storeUrl, accessToken, productId) {
  const productGid = `gid://shopify/Product/${productId}`;
  const query = `
    query getProductMarkets($id: ID!) {
      product(id: $id) {
        id
        title
        publishedInFI: publishedInContext(context: {country: FI})
        publishedInDE: publishedInContext(context: {country: DE})
        resourcePublications(first: 10) {
          edges {
            node {
              publication {
                id
                name
              }
              isPublished
            }
          }
        }
      }
    }
  `;

  try {
    const url = `https://${storeUrl}/admin/api/2025-10/graphql.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { id: productGid },
      }),
    });

    if (!response.ok) {
      console.warn(`  ⚠️  Failed to fetch markets for product ${productId}: ${response.status}`);
      return { markets: [], publishedToOnlineStore: false };
    }

    const data = await response.json();
    if (data.errors) {
      console.warn(`  ⚠️  GraphQL errors for product ${productId}:`, data.errors);
      return { markets: [], publishedToOnlineStore: false };
    }

    const product = data.data?.product;
    if (!product) {
      console.warn(`  ⚠️  Product not found: ${productId}`);
      return { markets: [], publishedToOnlineStore: false };
    }

    // Check if product is published to Blerinas catalog (our Storefront API token queries this publication)
    const blerinasPublication = product.resourcePublications?.edges?.find(
      (edge) => edge.node.publication?.name === 'Blerinas'
    );
    const publishedToOnlineStore = blerinasPublication?.node.isPublished || false; // Keep variable name for backward compatibility

    const markets = [];
    if (product.publishedInFI) markets.push('FI');
    if (product.publishedInDE) markets.push('DE');
    
    if (markets.length === 0) {
      console.warn(`  ⚠️  Product ${productId} (${product.title}) has no markets assigned`);
    }

    if (!publishedToOnlineStore) {
      console.warn(`  ⚠️  Product ${productId} (${product.title}) is NOT published to Blerinas catalog - will not be accessible via Storefront API`);
    }

    return { markets, publishedToOnlineStore };
  } catch (error) {
    console.warn(`  ⚠️  Error fetching markets for product ${productId}:`, error.message);
    return { markets: [], publishedToOnlineStore: false };
  }
}

/**
 * Parse storefront tags from Shopify product tags
 * Format: "storefront:main", "storefront:giftshop", etc.
 */
function parseStorefrontTags(tags) {
  if (!tags || !Array.isArray(tags)) {
    // If tags is a string, split it
    const tagArray = typeof tags === 'string' 
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    return tagArray
      .filter(tag => tag.toLowerCase().startsWith('storefront:'))
      .map(tag => tag.replace(/^storefront:/i, '').toUpperCase());
  }
  return tags
    .filter(tag => tag.toLowerCase().startsWith('storefront:'))
    .map(tag => tag.replace(/^storefront:/i, '').toUpperCase());
}

/**
 * Parse market tags from Shopify product tags
 * Format: "market:FI", "market:DE", etc.
 */
function parseMarketTags(tags) {
  if (!tags || !Array.isArray(tags)) {
    // If tags is a string, split it
    const tagArray = typeof tags === 'string' 
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    return tagArray
      .filter(tag => tag.toLowerCase().startsWith('market:'))
      .map(tag => tag.replace(/^market:/i, '').toUpperCase());
  }
  return tags
    .filter(tag => tag.toLowerCase().startsWith('market:'))
    .map(tag => tag.replace(/^market:/i, '').toUpperCase());
}

/**
 * Fetch shipping rates from Shopify Admin API (deliveryProfiles)
 * Returns shipping rates per market (country code)
 */
async function fetchShippingRatesFromAdmin(storeUrl, accessToken) {
  try {
    const query = `
      query {
        deliveryProfiles(first: 10) {
          edges {
            node {
              id
              name
              profileLocationGroups {
                locationGroupZones(first: 20) {
                  edges {
                    node {
                      zone {
                        id
                        name
                        countries {
                          code {
                            countryCode
                          }
                        }
                      }
                      methodDefinitions(first: 10) {
                        edges {
                          node {
                            id
                            name
                            description
                            active
                            rateProvider {
                              ... on DeliveryRateDefinition {
                                id
                                price {
                                  amount
                                  currencyCode
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const url = `https://${storeUrl}/admin/api/2025-10/graphql.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify Admin API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const { data, errors } = await response.json();
    
    if (errors) {
      throw new Error(`Shopify Admin API GraphQL errors: ${JSON.stringify(errors)}`);
    }

    // Parse shipping rates by country code
    const ratesByMarket = {};

    if (data?.deliveryProfiles?.edges) {
      data.deliveryProfiles.edges.forEach(profile => {
        const locationGroups = profile.node.profileLocationGroups || [];
        
        locationGroups.forEach(group => {
          const zones = group.locationGroupZones?.edges || [];
          
          zones.forEach(zoneEdge => {
            const zone = zoneEdge.node;
            const countries = zone.zone?.countries || [];
            
            countries.forEach(country => {
              const countryCode = country.code?.countryCode;
              
              if (!countryCode) return;

              // Get active shipping methods with prices
              const methods = (zone.methodDefinitions?.edges || [])
                .filter(m => m.node.active && m.node.rateProvider)
                .map(m => ({
                  name: m.node.name,
                  price: parseFloat(m.node.rateProvider.price?.amount || 0),
                  currency: m.node.rateProvider.price?.currencyCode || 'EUR'
                }))
                .filter(m => m.price >= 0) // Filter out invalid prices
                .sort((a, b) => a.price - b.price); // Sort by price (lowest first)

              if (methods.length > 0) {
                // Store standard (lowest) and express (highest) rates
                ratesByMarket[countryCode] = {
                  standard: methods[0].price.toFixed(2), // Lowest rate
                  express: methods[methods.length - 1]?.price.toFixed(2) || methods[0].price.toFixed(2), // Highest rate
                  currency: methods[0].currency,
                  allRates: methods // Store all rates for reference
                };
              }
            });
          });
        });
      });
    }

    return ratesByMarket;
  } catch (error) {
    console.warn(`  ⚠️  Failed to fetch shipping rates from Admin API: ${error.message}`);
    return null;
  }
}

/**
 * Fetch market-specific product data from Storefront API using @inContext
 * Returns market-specific pricing, availability, and currency
 */
async function fetchProductMarketData(productId, market) {
  try {
    const storefrontModule = await import('../lib/shopify-storefront-api.js').catch(() => null);
    if (!storefrontModule?.fetchProductForMarket) {
      console.warn(`  ⚠️  fetchProductForMarket not available, skipping market data for ${market}`);
      return null;
    }
    
    const productGid = `gid://shopify/Product/${productId}`;
    const productData = await storefrontModule.fetchProductForMarket(productGid, market);
    
    if (!productData) {
      return null;
    }
    
    // Note: shippingEstimate will be added in buildMarketsObject using Admin API rates
    return {
      available: productData.availableForSale || false,
      price: productData.priceRange?.minVariantPrice?.amount || '0.00',
      currency: productData.priceRange?.minVariantPrice?.currencyCode || 'EUR'
    };
  } catch (error) {
    console.warn(`  ⚠️  Failed to fetch market data for ${market}:`, error.message);
    return null;
  }
}

/**
 * Build markets object with market-specific data from Storefront API
 * Format: { FI: { available: true, price: "29.99", currency: "EUR", shippingEstimate: "4.99" }, ... }
 */
async function buildMarketsObject(productId, marketsArray, shippingRates = null) {
  const marketsObject = {};
  
  // Fetch market-specific data for each market
  for (const market of marketsArray) {
    const marketData = await fetchProductMarketData(productId, market);
    
    // Get shipping estimate: prefer Admin API rates, fallback to market config
    let shippingEstimate = '0.00';
    if (shippingRates && shippingRates[market]) {
      // Use standard (lowest) rate from Admin API
      shippingEstimate = shippingRates[market].standard;
    } else {
      // Fallback to market config estimate
      const marketUtilsModule = await import('../lib/market-utils.js').catch(() => null);
      const marketConfig = marketUtilsModule?.getMarketConfig?.(market) || {};
      shippingEstimate = marketConfig.shippingEstimate || '0.00';
    }
    
    if (marketData) {
      marketsObject[market] = {
        ...marketData,
        shippingEstimate: shippingEstimate // Override with Admin API rate if available
      };
    } else {
      // Fallback: assume available if we can't fetch data
      marketsObject[market] = {
        available: true,
        price: '0.00',
        currency: 'EUR',
        shippingEstimate: shippingEstimate
      };
    }
  }
  
  return marketsObject;
}

const buildShopifyDocument = async (product, matchedCategorySlug, markets = [], publishedToOnlineStore = false, storefrontIndexed = false, shippingRates = null) => {
  const tags = product.tags
    ? product.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  // Parse storefront and market tags
  const suggestedStorefronts = parseStorefrontTags(tags);
  const suggestedMarkets = parseMarketTags(tags);
  
  // Use markets from Shopify Markets (passed in) or from tags
  const finalMarkets = markets.length > 0 ? markets : suggestedMarkets;
  
  // Build markets object with market-specific data (if markets available)
  let marketsObject = {};
  if (finalMarkets.length > 0 && publishedToOnlineStore && storefrontIndexed) {
    // Only fetch market data if product is published and indexed
    marketsObject = await buildMarketsObject(product.id, finalMarkets, shippingRates);
  } else if (finalMarkets.length > 0) {
    // Fallback: create markets object without fetching (will be updated later)
    // Get shipping estimate: prefer Admin API rates, fallback to market config
    const marketUtilsModule = await import('../lib/market-utils.js').catch(() => null);
    
    finalMarkets.forEach(market => {
      let shippingEstimate = '0.00';
      if (shippingRates && shippingRates[market]) {
        shippingEstimate = shippingRates[market].standard;
      } else {
        const marketConfig = marketUtilsModule?.getMarketConfig?.(market) || {};
        shippingEstimate = marketConfig.shippingEstimate || '0.00';
      }
      
      marketsObject[market] = {
        available: true,
        price: '0.00',
        currency: 'EUR',
        shippingEstimate: shippingEstimate
      };
    });
  }

  // Filter markets array to only include markets where available !== false
  // This ensures we only save markets where the product is executable in Shopify
  const availableMarkets = Object.keys(marketsObject).filter(market => {
    const marketData = marketsObject[market];
    return marketData && marketData.available !== false;
  });

  return {
    shopifyId: product.id,
    title: product.title,
    handle: product.handle || null,
    status: product.status || null,
    vendor: product.vendor || null,
    productType: product.product_type || null,
    tags,
    markets: availableMarkets.length > 0 ? availableMarkets : finalMarkets, // Only include available markets (for backward compatibility and filtering)
    marketsObject, // Object with market-specific data (new format with Shopify Markets)
    publishedToOnlineStore, // Store Online Store publication status
    storefrontIndexed, // Store Storefront API indexing status
    matchedCategorySlug: matchedCategorySlug || null,
    imageUrls: extractImageUrls(product),
    rawProduct: product, // This now includes enriched variants with inventory data
    storefronts: suggestedStorefronts, // Suggested from tags (can be overridden in admin)
    processedStorefronts: [],
    hasProcessedStorefronts: false, // Boolean flag for efficient querying of unprocessed items
    // Product-level stock status (calculated from variants)
    hasInStockVariants: product.hasInStockVariants || false, // True if at least one variant is available
    inStockVariantCount: product.inStockVariantCount || 0, // Count of in-stock variants
    totalVariantCount: product.totalVariantCount || 0, // Total variant count
  };
};

function matchProductToCategory(product) {
  const title = (product.title || '').toLowerCase();
  const description = (product.body_html || '').toLowerCase();
  const productType = (product.product_type || '').toLowerCase();
  const tags = (product.tags || '').toLowerCase().split(',').map(t => t.trim());
  
  const scores = {};
  
  for (const [categorySlug, config] of Object.entries(CATEGORY_MATCHING)) {
    let score = 0;
    
    for (const keyword of config.keywords) {
      if (title.includes(keyword)) score += 3;
      if (description.includes(keyword)) score += 1;
    }
    
    if (config.productTypes.some(pt => productType.includes(pt))) {
      score += 5;
    }
    
    for (const tag of tags) {
      if (config.tags.some(configTag => tag.includes(configTag))) {
        score += 4;
      }
    }
    
    if (score > 0) {
      scores[categorySlug] = score;
    }
  }
  
  const entries = Object.entries(scores);
  if (entries.length === 0) return null;
  
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * Get list of storefronts by checking root-level collections
 */
async function getStorefronts() {
  const storefronts = [];
  try {
    const collections = await db.listCollections();
    for (const coll of collections) {
      const id = coll.id;
      // Storefronts are root folders that have a 'products' subcollection
      // Skip known root collections like 'shopifyItems', 'orders', etc.
      if (id !== 'shopifyItems' && id !== 'orders' && id !== 'carts' && id !== 'users' && id !== 'userEvents') {
        // Check if this collection has a 'products' subcollection
        try {
          const itemsSnapshot = await coll.doc('products').collection('items').limit(1).get();
          if (!itemsSnapshot.empty || id === 'LUNERA') {
            // It's a storefront
            storefronts.push(id);
          }
        } catch (e) {
          // Not a storefront, skip
        }
      }
    }
  } catch (error) {
    console.error('Error getting storefronts:', error);
    // Fallback to default
    return ['LUNERA'];
  }
  return storefronts.length > 0 ? storefronts : ['LUNERA'];
}

/**
 * Update storefront products when shopifyItems data changes
 * This ensures both collections stay in sync
 */
async function updateStorefrontProducts(shopifyId, updateData) {
  const storefronts = await getStorefronts();
  const updatedCount = [];
  
  for (const storefront of storefronts) {
    try {
      const productsCollection = db.collection(storefront).doc('products').collection('items');
      
      // Find products with matching sourceShopifyId
      const snapshot = await productsCollection
        .where('sourceShopifyId', '==', shopifyId.toString())
        .get();
      
      if (snapshot.empty) {
        continue; // No products in this storefront
      }
      
      for (const productDoc of snapshot.docs) {
        const productRef = productDoc.ref;
        const productData = productDoc.data();
        
        // Prepare update payload - only update fields that come from Shopify
        const storefrontUpdate = {
          updatedAt: FieldValue.serverTimestamp(),
        };
        
        // Update marketsObject if it changed
        if (updateData.marketsObject) {
          storefrontUpdate.marketsObject = updateData.marketsObject;
          // Also update markets array - only include markets where available !== false
          // This ensures we only save markets where the product is executable in Shopify
          storefrontUpdate.markets = Object.keys(updateData.marketsObject).filter(market => {
            const marketData = updateData.marketsObject[market];
            return marketData && marketData.available !== false;
          });
        } else if (updateData.markets) {
          // Fallback: update markets array if marketsObject not available
          storefrontUpdate.markets = updateData.markets;
        }
        
        // Update publishedToOnlineStore flag
        if (updateData.publishedToOnlineStore !== undefined) {
          storefrontUpdate.publishedToOnlineStore = updateData.publishedToOnlineStore;
        }
        
        // Update variant data if available
        if (updateData.rawProduct?.variants) {
          // Update variants collection
          const variantsCollection = productRef.collection('variants');
          const existingVariantsSnapshot = await variantsCollection.get();
          const existingVariants = existingVariantsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          for (const shopifyVariant of updateData.rawProduct.variants) {
            // Find matching variant by shopifyVariantId or shopifyInventoryItemId
            let variantRef = null;
            
            if (shopifyVariant.id) {
              const matchedByShopifyId = existingVariants.find(
                (v) => v.shopifyVariantId?.toString() === shopifyVariant.id.toString()
              );
              if (matchedByShopifyId) {
                variantRef = variantsCollection.doc(matchedByShopifyId.id);
              }
            }
            
            if (!variantRef && shopifyVariant.inventory_item_id) {
              const matchedByInventoryId = existingVariants.find(
                (v) => v.shopifyInventoryItemId?.toString() === shopifyVariant.inventory_item_id.toString()
              );
              if (matchedByInventoryId) {
                variantRef = variantsCollection.doc(matchedByInventoryId.id);
              }
            }
            
            if (variantRef) {
              // Update variant with latest data from Shopify
              const variantUpdate = {
                stock: shopifyVariant.inventory_quantity || shopifyVariant.inventoryQuantity || 0,
                updatedAt: FieldValue.serverTimestamp(),
              };
              
              // Update inventory_levels if available
              if (shopifyVariant.inventory_levels) {
                variantUpdate.inventory_levels = shopifyVariant.inventory_levels;
              }
              
              // Update priceOverride if variant price changed
              if (shopifyVariant.price != null) {
                const variantPrice = parseFloat(shopifyVariant.price);
                if (Number.isFinite(variantPrice)) {
                  variantUpdate.priceOverride = variantPrice;
                }
              }
              
              await variantRef.update(variantUpdate);
            }
          }
        }
        
        // Update product document
        await productRef.update(storefrontUpdate);
        updatedCount.push({ storefront, productId: productDoc.id });
      }
    } catch (error) {
      console.error(`Error updating products in storefront ${storefront}:`, error);
      // Continue with other storefronts
    }
  }
  
  return updatedCount;
}

/**
 * Fetch specific products by ID from Shopify Admin API
 */
async function fetchProductsByIds(storeUrl, accessToken, productIds) {
  const products = [];
  
  // Fetch products in parallel (Shopify allows this)
  const fetchPromises = productIds.map(async (productId) => {
    try {
      const url = `https://${storeUrl}/admin/api/2025-10/products/${productId}.json`;
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️  Failed to fetch product ${productId}: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      return data.product || null;
    } catch (error) {
      console.warn(`⚠️  Error fetching product ${productId}:`, error.message);
      return null;
    }
  });
  
  const results = await Promise.all(fetchPromises);
  return results.filter(Boolean); // Remove null results
}

async function fetchAllShopifyProducts(storeUrl, accessToken) {
  const products = [];
  let pageInfo = null;
  let hasNextPage = true;
  
  const baseUrl = `https://${storeUrl}/admin/api/2025-10/products.json`;
  
  while (hasNextPage) {
    let url = baseUrl;
    if (pageInfo) {
      url += `?page_info=${pageInfo}`;
    }
    
    try {
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      const data = await response.json();
      const pageProducts = data.products || [];
      products.push(...pageProducts);
      
      const linkHeader = response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]+page_info=([^>]+)>[^<]*rel="next"/);
        if (nextMatch) {
          pageInfo = nextMatch[1];
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error fetching products:`, error);
      throw error;
    }
  }
  
  return products;
}

async function importProducts() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!storeUrl || !accessToken) {
    throw new Error('Missing required environment variables: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN');
  }
  
  // Check if specific products/variants were selected for import
  let selectedItems = null;
  if (process.env.SELECTED_SHOPIFY_ITEMS_JSON) {
    try {
      selectedItems = JSON.parse(process.env.SELECTED_SHOPIFY_ITEMS_JSON);
      console.log(`📋 Importing ${selectedItems.length} selected product(s)`);
    } catch (error) {
      // Silent fail - proceed with full import
    }
  }
  
  // Fetch shipping rates once at the start (shared across all products)
  const shippingRates = await fetchShippingRatesFromAdmin(storeUrl, accessToken);
  
  // Fetch only selected products if specified, otherwise fetch all
  let shopifyProducts = [];
  if (selectedItems && selectedItems.length > 0) {
    const selectedProductIds = selectedItems.map(item => item.productId?.toString());
    console.log(`🛍️  Fetching ${selectedProductIds.length} selected product(s) from Shopify...`);
    shopifyProducts = await fetchProductsByIds(storeUrl, accessToken, selectedProductIds);
    console.log(`✅ Fetched ${shopifyProducts.length} product(s) from Shopify`);
  } else {
    console.log(`🛍️  Fetching all products from Shopify...`);
    shopifyProducts = await fetchAllShopifyProducts(storeUrl, accessToken);
    console.log(`✅ Fetched ${shopifyProducts.length} products from Shopify`);
  }
  
  const productsToImport = shopifyProducts;
  
  const shopifyCollection = db.collection('shopifyItems');
  let totalUpserted = 0;
  let totalSkipped = 0;
  let matchedCount = 0;
  const unmatchedProducts = [];
  
  for (const product of productsToImport) {
    // If specific variants were selected, filter them
    const selectedItem = selectedItems?.find(item => item.productId?.toString() === product.id.toString());
    const selectedVariantIds = selectedItem?.variantIds ? new Set(selectedItem.variantIds.map(id => id.toString())) : null;
    
    // Filter variants if specific ones were selected
    if (selectedVariantIds && product.variants) {
      const originalVariantCount = product.variants.length;
      product.variants = product.variants.filter(variant => 
        selectedVariantIds.has(variant.id.toString())
      );
      if (product.variants.length === 0) {
        console.log(`  ⏭️  SKIPPING - No selected variants for product ${product.id}`);
        totalSkipped += 1;
        continue;
      }
      console.log(`  📦 Importing ${product.variants.length} selected variant(s) out of ${originalVariantCount} total`);
    }
    const documentId = generateDocumentId(product);
    const docRef = shopifyCollection.doc(documentId);
    
    const existingDoc = await docRef.get();
    const isExisting = existingDoc.exists;
    
    // Query markets and publication status for both new and existing products
    const { markets, publishedToOnlineStore } = await getProductMarkets(storeUrl, accessToken, product.id);
    
    // Check Storefront API accessibility - REQUIRED for import
    // Only import products that are both published AND indexed in Storefront API
    let storefrontIndexed = false;
    
    if (publishedToOnlineStore) {
      try {
        // Use dynamic import with .catch() to handle ES module import in CommonJS context
        const graphqlModule = await import('../lib/shopify-admin-graphql.js').catch(() => null);
        if (graphqlModule?.checkProductStorefrontAccessibility) {
          const productGid = `gid://shopify/Product/${product.id}`;
          const accessibilityCheck = await graphqlModule.checkProductStorefrontAccessibility(productGid);
          storefrontIndexed = accessibilityCheck.accessible || false;
        }
      } catch (error) {
        // Silent fail - assume not indexed
      }
    }
    
    // Simplified logging - check if product is ready
    if (!publishedToOnlineStore) {
      console.log(`❌ "${product.title}" is not published (if you just published, wait 2-3 min)`);
      totalSkipped += 1;
      continue;
    }
    
    if (!storefrontIndexed) {
      console.log(`⏳ "${product.title}" is published but not yet indexed (wait 2-3 min after publishing)`);
      totalSkipped += 1;
      continue;
    }
    
    if (isExisting) {
      // Update existing product with markets/publication status if missing
      const existingData = existingDoc.data();
      
      // Only update if product is published AND indexed
      // Don't update if product becomes unindexed or unpublished
      if (!publishedToOnlineStore || !storefrontIndexed) {
        totalSkipped += 1;
        continue;
      }
      
      // Check if update is needed
      const needsUpdate = !existingData.markets || existingData.markets.length === 0 || 
                         existingData.publishedToOnlineStore === undefined ||
                         existingData.publishedToOnlineStore !== publishedToOnlineStore ||
                         (existingData.storefrontIndexed !== undefined && existingData.storefrontIndexed !== storefrontIndexed) ||
                         !existingData.marketsObject ||
                         JSON.stringify(existingData.markets || []) !== JSON.stringify(markets);
      
      const shouldUpdateMarketsObject = true; // Always update to get latest prices/shipping
      
      if (needsUpdate || shouldUpdateMarketsObject) {
        const enrichedProduct = await enrichProductWithInventory(storeUrl, accessToken, product);
        const categorySlug = existingData.matchedCategorySlug || matchProductToCategory(enrichedProduct);
        const updatePayload = await buildShopifyDocument(enrichedProduct, categorySlug, markets, publishedToOnlineStore, storefrontIndexed, shippingRates);
        
        // Preserve hasProcessedStorefronts if item was already processed
        // Only set to false if processedStorefronts is empty
        const existingProcessedStorefronts = existingData.processedStorefronts || [];
        const hasProcessedStorefronts = existingProcessedStorefronts.length > 0 
          ? true 
          : false; // Always false for unprocessed items
        
        await docRef.set({
          ...updatePayload,
          hasProcessedStorefronts, // Preserve or set based on processedStorefronts
          storefrontIndexed: true,
          slug: documentId,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        
        await updateStorefrontProducts(product.id, updatePayload);
        console.log(`✅ Updated: "${product.title}"`);
        totalUpserted += 1;
      }
      continue;
    }
    
    // Import new product
    const enrichedProduct = await enrichProductWithInventory(storeUrl, accessToken, product);
    const categorySlug = matchProductToCategory(enrichedProduct);
    if (categorySlug) {
      matchedCount += 1;
    } else {
      unmatchedProducts.push(enrichedProduct);
    }
    
    const payload = await buildShopifyDocument(enrichedProduct, categorySlug, markets, publishedToOnlineStore, storefrontIndexed, shippingRates);
    
    await docRef.set(
      {
        ...payload,
        storefrontIndexed: true,
        slug: documentId,
        fetchedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    
    console.log(`✅ Imported: "${product.title}"`);
    totalUpserted += 1;
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`  • Imported: ${totalUpserted} product(s)`);
  console.log(`  • Skipped: ${totalSkipped} product(s)`);
}

async function main() {
  try {
    await importProducts();
  } catch (error) {
    console.error('❌ Failed to import products:', error);
    process.exitCode = 1;
  } finally {
    await admin.app().delete().catch(() => {});
  }
}

main();
