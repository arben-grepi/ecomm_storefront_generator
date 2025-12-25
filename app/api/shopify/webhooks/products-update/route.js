import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firestore-server';
import { getProductMarkets, publishProductToOnlineStore } from '@/lib/shopify-admin-graphql';
import { buildMarketsArray, getMarketConfig } from '@/lib/market-utils';

/**
 * Verify Shopify webhook HMAC signature
 * Uses the webhook secret provided by Shopify to verify the request is authentic
 */
function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  
  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET not configured in environment variables');
    return false;
  }

  // Verify the HMAC signature matches what Shopify sent
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  const isValid = digest === hmacHeader;
  
  if (!isValid) {
    console.error('Webhook signature verification failed. Make sure SHOPIFY_WEBHOOK_SECRET matches Shopify webhook secret.');
  }

  return isValid;
}

/**
 * Extract image URLs from Shopify product
 */
function extractImageUrls(product) {
  return (product.images || [])
    .map((img) => (typeof img === 'object' ? img.src : img))
    .filter(Boolean);
}

/**
 * Fetch shipping rates from Shopify Admin API
 */
async function fetchShippingRatesFromAdmin() {
  try {
    const { storeUrl, accessToken } = getAdminCredentials();
    
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
                .filter(m => m.price >= 0); // Filter out invalid prices

              if (methods.length > 0) {
                // Look for "standard" rate by name (case-insensitive)
                const standardRate = methods.find(m => 
                  m.name.toLowerCase().includes('standard')
                );
                
                // If "standard" rate found, use it; otherwise use lowest rate
                const standardPrice = standardRate 
                  ? standardRate.price.toFixed(2)
                  : methods.sort((a, b) => a.price - b.price)[0].price.toFixed(2);
                
                const standardCurrency = standardRate 
                  ? standardRate.currency
                  : methods.sort((a, b) => a.price - b.price)[0].currency;
                
                // Find express rate (highest price, or one with "express" in name)
                const expressRate = methods.find(m => 
                  m.name.toLowerCase().includes('express')
                );
                const sortedByPrice = methods.sort((a, b) => a.price - b.price);
                const expressPrice = expressRate
                  ? expressRate.price.toFixed(2)
                  : sortedByPrice[sortedByPrice.length - 1]?.price.toFixed(2) || standardPrice;

                ratesByMarket[countryCode] = {
                  standard: standardPrice,
                  express: expressPrice,
                  currency: standardCurrency,
                  hasActualRates: true, // Flag to indicate these are actual Shopify rates, not estimates
                  allRates: methods, // Store all rates for reference
                  lastUpdated: new Date().toISOString() // Track when rates were last synced
                };
              }
            });
          });
        });
      });
    }

    return ratesByMarket;
  } catch (error) {
    console.warn(`[Webhook] Failed to fetch shipping rates from Admin API: ${error.message}`);
    return null;
  }
}

/**
 * Get admin credentials for API calls
 */
function getAdminCredentials() {
  const storeUrl = process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!storeUrl || !accessToken) {
    throw new Error('Missing Shopify Admin API credentials. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.');
  }
  
  return { storeUrl, accessToken };
}

/**
 * Fetch product market data using Storefront API with @inContext
 */
/**
 * Fetch market-specific availability and currency from Storefront API
 * NOTE: We do NOT fetch prices here - variant prices come from the Admin API webhook payload
 * Prices are stored per-variant, not per-market
 */
async function fetchProductMarketData(productId, market) {
  try {
    const { fetchProductForMarket } = await import('@/lib/shopify-storefront-api');
    const productGid = `gid://shopify/Product/${productId}`;
    const productData = await fetchProductForMarket(productGid, market);
    
    if (!productData) {
      return null;
    }
    
    // Only return availability and currency - NOT price
    // Price comes from variant.price in the webhook payload
    return {
      available: productData.availableForSale || false,
      currency: productData.priceRange?.minVariantPrice?.currencyCode || 'EUR'
      // NOTE: We intentionally do NOT include price here
      // Variant prices are stored per-variant from the Admin API, not per-market
    };
  } catch (error) {
    console.warn(`[Webhook] Failed to fetch market data for ${market}:`, error.message);
    return null;
  }
}

/**
 * Build marketsObject with market-specific data from Storefront API
 */
async function buildMarketsObjectForWebhook(productId, marketsArray, shippingRates = null) {
  const marketsObject = {};
  
  // Fetch market-specific data for each market
  for (const market of marketsArray) {
    const marketData = await fetchProductMarketData(productId, market);
    
    // Get shipping rate: prefer actual Shopify rates, fallback to market config estimate
    let shippingRate = null;
    let isEstimate = true;
    
    if (shippingRates && shippingRates[market]) {
      // Use actual Shopify rate if available
      shippingRate = shippingRates[market].standard;
      isEstimate = !shippingRates[market].hasActualRates; // Use flag to determine if it's an estimate
    } else {
      // Fallback to market config estimate
      const marketConfig = getMarketConfig(market);
      shippingRate = marketConfig.shippingEstimate || '0.00';
      isEstimate = true;
    }
    
    // Get delivery estimate from market config
    const marketConfig = getMarketConfig(market);
    const deliveryEstimateDays = marketConfig.deliveryEstimateDays || '7-10';
    
    if (marketData) {
      marketsObject[market] = {
        ...marketData,
        shippingRate: shippingRate, // Actual rate or estimate
        shippingEstimate: shippingRate, // Keep for backward compatibility
        isShippingEstimate: isEstimate, // Flag to indicate if it's an estimate
        deliveryEstimateDays: deliveryEstimateDays // Delivery time estimate (e.g., "7-10")
      };
    } else {
      // Fallback: assume available if we can't fetch data
      marketsObject[market] = {
        available: true,
        currency: 'EUR', // Default currency
        // NOTE: No price here - prices come from variant.price in the webhook payload
        shippingRate: shippingRate,
        shippingEstimate: shippingRate, // Keep for backward compatibility
        isShippingEstimate: isEstimate,
        deliveryEstimateDays: deliveryEstimateDays
      };
    }
  }
  
  return marketsObject;
}

/**
 * Update Shopify items collection (raw data)
 */
async function updateShopifyItem(db, shopifyProduct) {
  const shopifyCollection = db.collection('shopifyItems');
  
  // Find document by shopifyId
  const snapshot = await shopifyCollection.where('shopifyId', '==', shopifyProduct.id).limit(1).get();
  
  if (snapshot.empty) {
    console.log(`Shopify item ${shopifyProduct.id} not found in shopifyItems, skipping update`);
    return null;
  }

  const docRef = snapshot.docs[0].ref;
  const existingData = snapshot.docs[0].data();
  
  // Query product markets and Online Store publication status from Shopify Admin GraphQL API
  let markets = existingData.markets || []; // Keep existing if query fails
  let publishedToOnlineStore = existingData.publishedToOnlineStore || false; // Keep existing if query fails
  let marketsObject = existingData.marketsObject || null; // Keep existing if query fails
  
  try {
    const productGid = `gid://shopify/Product/${shopifyProduct.id}`;
    const marketInfo = await getProductMarkets(productGid);
    markets = buildMarketsArray(marketInfo);
    publishedToOnlineStore = marketInfo.publishedToOnlineStore || false;
    
    // Fetch marketsObject with market-specific availability, currency, and shipping if product is published
    // NOTE: Prices are NOT market-specific - they come from variant.price in the webhook payload
    if (publishedToOnlineStore && markets.length > 0) {
      try {
        const shippingRates = await fetchShippingRatesFromAdmin();
        marketsObject = await buildMarketsObjectForWebhook(shopifyProduct.id, markets, shippingRates);
        console.log(`[Product Webhook] ℹ️  Note: Variant prices are stored per-variant (from webhook payload), not per-market`);
      } catch (error) {
        console.warn(`[Product Webhook] ⚠️  Failed to fetch marketsObject: ${error.message}`);
        // Keep existing marketsObject if fetch fails
      }
    }
  } catch (error) {
    console.error(`[Product Webhook] Failed to get markets/publication status for product ${shopifyProduct.id}:`, error.message || error);
    // Keep existing markets/publication status if query fails
  }
  
  // Log title change if it's different
  const oldTitle = existingData.title;
  const newTitle = shopifyProduct.title;
  if (oldTitle !== newTitle) {
    console.log(`[Product Webhook] Title changed: "${oldTitle}" → "${newTitle}"`);
  }

  const updateData = {
    title: shopifyProduct.title || existingData.title, // Ensure title is always set, fallback to existing if missing
    handle: shopifyProduct.handle || null,
    status: shopifyProduct.status || null,
    vendor: shopifyProduct.vendor || null,
    productType: shopifyProduct.product_type || null,
    tags: shopifyProduct.tags
      ? shopifyProduct.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    markets, // Update markets array
    ...(marketsObject && Object.keys(marketsObject).length > 0 ? { marketsObject } : {}), // Update marketsObject if available
    publishedToOnlineStore, // Update Online Store publication status
    imageUrls: extractImageUrls(shopifyProduct),
    rawProduct: shopifyProduct, // Always update rawProduct to ensure it has the latest data
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(updateData, { merge: true });
  console.log(`[Product Webhook] ✅ Updated Shopify item: ${docRef.id} (title: "${updateData.title}")`);
  
  // Auto-publish product to Online Store if not already published
  if (!publishedToOnlineStore) {
    try {
      const productGid = `gid://shopify/Product/${shopifyProduct.id}`;
      console.log(`[Product Webhook] Auto-publishing product ${shopifyProduct.id} to Online Store...`);
      await publishProductToOnlineStore(productGid);
      
      // Update Firestore with new publication status
      await docRef.update({
        publishedToOnlineStore: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[Product Webhook] ✅ Auto-published product ${shopifyProduct.id} to Online Store`);
      
      // Update local variables for return value
      publishedToOnlineStore = true;
    } catch (error) {
      console.error(`[Product Webhook] ⚠️  Failed to auto-publish product ${shopifyProduct.id} to Online Store:`, error.message || error);
      // Don't throw - webhook should still succeed even if auto-publish fails
    }
  }
  
  // Return the updated data so it can be passed to updateProcessedProduct
  return {
    docId: docRef.id,
    data: {
      ...updateData,
      marketsObject, // Include the updated marketsObject
      markets,
      publishedToOnlineStore,
    }
  };
}

/**
 * Get list of storefronts by checking root-level collections
 */
async function getStorefronts(db) {
  const storefronts = [];
  try {
    // Get all root-level collections
    const collections = await db.listCollections();
    for (const coll of collections) {
      const id = coll.id;
      // Storefronts are root folders that have a 'products' subcollection
      // Skip known root collections like 'shopifyItems', 'orders', etc.
      if (id !== 'shopifyItems' && id !== 'orders' && id !== 'carts' && id !== 'users' && id !== 'userEvents' && id !== 'shippingRates') {
        // Check if this collection has a 'products' subcollection
        try {
          const itemsSnapshot = await coll.doc('products').collection('items').limit(1).get();
          if (!itemsSnapshot.empty) {
            // It's a storefront (has products)
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
 * Update processed product if it exists across all storefronts
 * @param {Object} db - Firestore database instance
 * @param {Object} shopifyProduct - Shopify product data from webhook
 * @param {Object} updatedShopifyItemData - Optional: Updated shopifyItem data (to avoid re-fetching)
 */
async function updateProcessedProduct(db, shopifyProduct, updatedShopifyItemData = null) {
  // First, get the shopifyItems document to check which storefronts should contain this product
  // Use provided data if available (from updateShopifyItem), otherwise fetch fresh
  let shopifyItemData = updatedShopifyItemData;
  
  if (!shopifyItemData) {
    const shopifyCollection = db.collection('shopifyItems');
    const shopifySnapshot = await shopifyCollection
      .where('shopifyId', '==', shopifyProduct.id.toString())
      .limit(1)
      .get();
    
    if (!shopifySnapshot.empty) {
      shopifyItemData = shopifySnapshot.docs[0].data();
    }
  }
  
  let targetStorefronts = null; // null means update all storefronts (backward compatibility)
  
  if (shopifyItemData) {
    // If storefronts array exists and is not empty, only update those storefronts
    // This respects admin decisions about which storefronts should contain the product
    if (shopifyItemData.storefronts && Array.isArray(shopifyItemData.storefronts) && shopifyItemData.storefronts.length > 0) {
      targetStorefronts = shopifyItemData.storefronts;
    }
  }

  const allStorefronts = await getStorefronts(db);
  const storefrontsToUpdate = targetStorefronts || allStorefronts;
  const updatedIds = [];

  const firstVariant = shopifyProduct.variants?.[0];
  const basePriceFromShopify = firstVariant ? parseFloat(firstVariant.price ?? 0) : NaN;
  const newImageUrls = extractImageUrls(shopifyProduct);

  // Search for products in each target storefront
  for (const storefront of storefrontsToUpdate) {
    try {
      const productsCollection = db.collection(storefront).doc('products').collection('items');

      // Convert shopifyProduct.id to number for query (products store sourceShopifyId as number)
      const shopifyIdAsNumber = typeof shopifyProduct.id === 'string' 
        ? Number(shopifyProduct.id) 
        : shopifyProduct.id;
      
      const snapshot = await productsCollection
        .where('sourceShopifyId', '==', shopifyIdAsNumber)
        .get();

      if (snapshot.empty) {
        continue; // No products in this storefront
      }

      // Helper function to normalize image URLs for comparison (remove query params)
      // This allows matching images even if URLs have different query parameters
      const normalizeImageUrl = (url) => {
        if (!url) return '';
        return url.split('?')[0];
      };

      for (const productDoc of snapshot.docs) {
        const productRef = productDoc.ref;
        const variantsCollection = productRef.collection('variants');
        const productData = productDoc.data();

        const normalizedBasePrice = Number.isFinite(basePriceFromShopify)
          ? basePriceFromShopify
          : (typeof productData.basePrice === 'number' ? productData.basePrice : 0);

        // Get marketsObject from shopifyItems if available (we already fetched it above)
        let marketsObject = null;
        let markets = productData.markets || [];
        let publishedToOnlineStore = productData.publishedToOnlineStore;
        
        if (shopifyItemData) {
          marketsObject = shopifyItemData.marketsObject || null;
          markets = shopifyItemData.markets || markets;
          publishedToOnlineStore = shopifyItemData.publishedToOnlineStore !== undefined 
            ? shopifyItemData.publishedToOnlineStore 
            : publishedToOnlineStore;
        }

        // Check if product was manually edited - if so, preserve selected images
        const isManuallyEdited = productData.manuallyEdited === true;
        
        // Handle product images: only update existing images that match Shopify
        let productImages = productData.images || [];
        if (isManuallyEdited && productImages.length > 0) {
          // Product has manually selected images - only update existing images that match Shopify
          // Normalize Shopify images for matching (base URL only)
          const normalizedShopifyImages = new Map();
          newImageUrls.forEach(shopifyImg => {
            const normalized = normalizeImageUrl(shopifyImg);
            if (normalized && !normalizedShopifyImages.has(normalized)) {
              normalizedShopifyImages.set(normalized, shopifyImg);
            }
          });
          
          // Update existing images: if an existing image matches a Shopify image (by base URL), update to new URL
          // Keep images that don't match (preserve manually selected images not in Shopify)
          const updatedImages = productImages.map(existingImg => {
            const normalizedExisting = normalizeImageUrl(existingImg);
            // Check if this existing image matches any Shopify image
            if (normalizedShopifyImages.has(normalizedExisting)) {
              // Match found - update to new Shopify URL (may have different query params)
              return normalizedShopifyImages.get(normalizedExisting);
            }
            // No match - preserve original manually selected image
            return existingImg;
          });
          
          // Only update if there were any changes
          const hasChanges = updatedImages.some((img, idx) => img !== productImages[idx]);
          if (hasChanges) {
            productImages = updatedImages;
          }
        } else if (!isManuallyEdited) {
          // Product not manually edited - update with all Shopify images
          productImages = newImageUrls.length > 0 ? newImageUrls : productData.images || [];
        }
        
        // CRITICAL: Product-level images can be updated (they're not manually selected per variant)
        // But variant images are NEVER updated - they're manually selected during import
        const productUpdate = {
          basePrice: normalizedBasePrice,
          images: productImages, // Product-level images (OK to update)
          ...(markets.length > 0 ? { markets } : {}),
          ...(marketsObject && Object.keys(marketsObject).length > 0 ? { marketsObject } : {}),
          ...(publishedToOnlineStore !== undefined ? { publishedToOnlineStore } : {}),
          updatedAt: FieldValue.serverTimestamp(),
          // NOTE: Variant images are handled separately below and are NEVER updated
        };

        if (shopifyProduct.variants && shopifyProduct.variants.length > 0) {
          const allVariantsSnapshot = await variantsCollection.get();
          const existingVariants = allVariantsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          // Get default variant ID from product data
          const defaultVariantId = productData.defaultVariantId || null;

          // Track which Shopify variant corresponds to the default variant
          let defaultVariantShopifyId = null;
          
          // First pass: Check if defaultVariantId is a Shopify variant ID (most common case)
          // If defaultVariantId matches any Shopify variant ID directly, use it
          if (defaultVariantId) {
            const directShopifyMatch = shopifyProduct.variants.find(
              (v) => v.id.toString() === defaultVariantId?.toString()
            );
            
            if (directShopifyMatch) {
              defaultVariantShopifyId = directShopifyMatch.id.toString();
              console.log(`[Webhook] ✅ Default variant matched directly by Shopify ID:`, {
                defaultVariantId,
                shopifyVariantId: defaultVariantShopifyId,
                price: directShopifyMatch.price
              });
            } else {
              // Fallback: Try to find it in existing variants by Firestore ID or existing Shopify ID
              const defaultVariant = existingVariants.find((v) => 
                v.id === defaultVariantId || v.shopifyVariantId === defaultVariantId?.toString()
              );
              defaultVariantShopifyId = defaultVariant?.shopifyVariantId || null;
              console.log(`[Webhook] Default variant lookup (fallback):`, {
                defaultVariantId,
                defaultVariantFound: !!defaultVariant,
                defaultVariantShopifyId,
                allExistingVariants: existingVariants.map(v => ({ id: v.id, shopifyVariantId: v.shopifyVariantId }))
              });
            }
          }

          // Update all variants
          for (const shopifyVariant of shopifyProduct.variants) {
            let variantRef = null;
            let existingVariantData = null;

            if (shopifyVariant.sku) {
              const matchedBySku = existingVariants.find((v) => v.sku === shopifyVariant.sku);
              if (matchedBySku) {
                existingVariantData = matchedBySku;
                variantRef = variantsCollection.doc(matchedBySku.id);
              }
            }

            if (!variantRef) {
              const shopifySize = shopifyVariant.option1 || shopifyVariant.option2 || shopifyVariant.option3;
              const shopifyColor = shopifyVariant.option1 || shopifyVariant.option2 || shopifyVariant.option3;

              const matchedByAttributes = existingVariants.find((v) => {
                const sizeMatch = shopifySize && v.size &&
                  v.size.toLowerCase().trim() === shopifySize.toLowerCase().trim();
                const colorMatch = shopifyColor && v.color &&
                  v.color.toLowerCase().trim() === shopifyColor.toLowerCase().trim();
                return sizeMatch || (sizeMatch && colorMatch);
              });

              if (matchedByAttributes) {
                existingVariantData = matchedByAttributes;
                variantRef = variantsCollection.doc(matchedByAttributes.id);
              }
            }

            if (variantRef) {
              // Check if this is the default variant and update tracking (only if not already found)
              // Priority: Direct Shopify ID match > existing variant's Shopify ID > Firestore document ID
              if (defaultVariantId && !defaultVariantShopifyId) {
                const isDefaultVariant = 
                  shopifyVariant.id.toString() === defaultVariantId?.toString() ||  // Direct Shopify ID match (most reliable)
                  existingVariantData.shopifyVariantId === defaultVariantId?.toString() ||  // Existing variant's Shopify ID
                  existingVariantData.id === defaultVariantId;  // Firestore document ID match
                
                if (isDefaultVariant) {
                  // This IS the default variant - update the Shopify ID from webhook
                  defaultVariantShopifyId = shopifyVariant.id.toString();
                  console.log(`[Webhook] ✅ Found default variant during variant processing:`, {
                    variantId: existingVariantData.id,
                    shopifyVariantId: shopifyVariant.id.toString(),
                    price: shopifyVariant.price,
                    defaultVariantId,
                    matchedBy: 
                      shopifyVariant.id.toString() === defaultVariantId?.toString() ? 'shopifyWebhookId' :
                      existingVariantData.shopifyVariantId === defaultVariantId?.toString() ? 'existingShopifyId' :
                      existingVariantData.id === defaultVariantId ? 'firestoreId' :
                      'unknown'
                  });
                }
              }
              
              // Get variant price from webhook payload
              const variantPrice = shopifyVariant.price != null ? parseFloat(shopifyVariant.price) : NaN;
              
              // Get existing variant images
              const existingImages = existingVariantData?.images;
              const variantHasImages = existingVariantData && 
                existingImages !== null && 
                existingImages !== undefined && 
                Array.isArray(existingImages) && 
                existingImages.length > 0;
              
              // Build base update payload
              const variantUpdate = {
                shopifyVariantId: shopifyVariant.id.toString(),
                shopifyInventoryItemId: shopifyVariant.inventory_item_id || undefined,
                stock: shopifyVariant.inventory_quantity || 0,
                price: Number.isFinite(variantPrice) ? variantPrice : null,
                updatedAt: FieldValue.serverTimestamp(),
              };
              
              // Handle images: ONLY update existing images that match Shopify (by base URL)
              // NEVER add new images, NEVER change defaultPhoto
              if (variantHasImages) {
                // Get variant-specific images from Shopify
                const variantImageUrls = (shopifyProduct.images || [])
                  .filter((img) => {
                    const imgVariantIds = img.variant_ids || [];
                    return imgVariantIds.includes(shopifyVariant.id);
                  })
                  .map((img) => (typeof img === 'object' ? img.src : img))
                  .filter(Boolean);
                
                // Also include main product images (some variants may use product-level images)
                const allShopifyImagesForVariant = variantImageUrls.length > 0
                  ? [...new Set([...variantImageUrls, ...newImageUrls])]
                  : newImageUrls;
                
                // Normalize Shopify images for matching (base URL only, ignoring query params)
                const normalizedShopifyImages = new Map();
                allShopifyImagesForVariant.forEach(shopifyImg => {
                  const normalized = normalizeImageUrl(shopifyImg);
                  if (normalized && !normalizedShopifyImages.has(normalized)) {
                    normalizedShopifyImages.set(normalized, shopifyImg);
                  }
                });
                
                // Update existing images: if an existing image matches a Shopify image (by base URL), update to new URL
                // Keep images that don't match (preserve manually selected images not in Shopify)
                // NEVER add new images - only update existing ones
                const updatedImages = existingImages.map(existingImg => {
                  const normalizedExisting = normalizeImageUrl(existingImg);
                  // Check if this existing image matches any Shopify image
                  if (normalizedShopifyImages.has(normalizedExisting)) {
                    // Match found - update to new Shopify URL (may have different query params)
                    return normalizedShopifyImages.get(normalizedExisting);
                  }
                  // No match - preserve original manually selected image
                  return existingImg;
                });
                
                // CRITICAL: Ensure we never add new images - array length must stay the same
                if (updatedImages.length !== existingImages.length) {
                  // This should never happen, but if it does, don't update images
                  console.error(`[Webhook] Image count mismatch for variant ${variantRef.id} - preserving existing images`);
                  // Don't include images in update - preserve existing
                } else {
                  // Only update if there were any changes
                  const hasImageChanges = updatedImages.some((img, idx) => img !== existingImages[idx]);
                  if (hasImageChanges) {
                    variantUpdate.images = updatedImages;
                  }
                  // If no changes, don't include images field - Firestore won't touch it
                }
              }
              // If variant has no images, don't set any (preserve empty state)
              
              // NEVER update defaultPhoto - it's manually selected during import
              // Explicitly ensure defaultPhoto is NOT in the update payload
              
              await variantRef.update(variantUpdate);
            }
          }
          
          // After all variants are updated, check if the default variant's price changed
          // and update product-level defaultVariantPrice for the product card
          if (defaultVariantShopifyId) {
            const updatedDefaultVariant = shopifyProduct.variants.find(
              (v) => v.id.toString() === defaultVariantShopifyId
            );
            
            if (updatedDefaultVariant) {
              const newDefaultPrice = updatedDefaultVariant.price != null 
                ? parseFloat(updatedDefaultVariant.price) 
                : null;
              
              if (newDefaultPrice !== null && Number.isFinite(newDefaultPrice)) {
                const currentDefaultPrice = productData.defaultVariantPrice;
                if (currentDefaultPrice !== newDefaultPrice) {
                  productUpdate.defaultVariantPrice = newDefaultPrice;
                  console.log(`[Webhook] ✅ Updated defaultVariantPrice from ${currentDefaultPrice} to ${newDefaultPrice} for product ${productDoc.id} (default variant ${defaultVariantId}, shopify variant ${defaultVariantShopifyId})`);
                } else {
                  console.log(`[Webhook] ℹ️ Default variant price unchanged: ${newDefaultPrice} for product ${productDoc.id}`);
                }
              } else {
                console.log(`[Webhook] ⚠️ Default variant found but price is invalid:`, {
                  productId: productDoc.id,
                  defaultVariantId,
                  defaultVariantShopifyId,
                  price: updatedDefaultVariant.price
                });
              }
            } else {
              console.log(`[Webhook] ⚠️ Default variant Shopify ID ${defaultVariantShopifyId} not found in shopifyProduct.variants for product ${productDoc.id}`);
            }
          } else {
            console.log(`[Webhook] ⚠️ No default variant Shopify ID found for product ${productDoc.id} (defaultVariantId: ${defaultVariantId})`);
          }
        }

        await productRef.update(productUpdate);

        updatedIds.push({ id: productDoc.id, storefront });
      }
    } catch (error) {
      console.error(`[Webhook] Error updating products in storefront ${storefront}:`, error);
    }
  }

  // Update cart prices for all users who have this product in their cart
  try {
    await updateCartPrices(db, shopifyProduct);
  } catch (error) {
    console.error(`[Webhook] Error updating cart prices:`, error);
    // Don't fail the webhook if cart update fails
  }

  return updatedIds;
}

/**
 * Update cart prices when product prices change
 * Finds all carts containing variants of this product and updates their prices
 */
async function updateCartPrices(db, shopifyProduct) {
  if (!shopifyProduct.variants || shopifyProduct.variants.length === 0) {
    console.log(`[Cart Update] No variants in product, skipping cart update`);
    return;
  }

  // Build a map of shopifyVariantId -> new price
  // Normalize IDs to strings for consistent comparison
  const variantPriceMap = new Map();
  shopifyProduct.variants.forEach(variant => {
    const price = variant.price != null ? parseFloat(variant.price) : null;
    if (price !== null && !isNaN(price)) {
      // Normalize variant ID to string (Shopify IDs can be numbers or strings)
      const variantId = String(variant.id);
      variantPriceMap.set(variantId, price);
      console.log(`[Cart Update] Mapped variant ${variantId} -> price ${price}`);
    }
  });

  if (variantPriceMap.size === 0) {
    console.log(`[Cart Update] No valid prices found, skipping cart update`);
    return; // No prices to update
  }

  console.log(`[Cart Update] Updating carts for ${variantPriceMap.size} variant(s)`);

  // Get all carts
  const cartsCollection = db.collection('carts');
  const cartsSnapshot = await cartsCollection.get();

  console.log(`[Cart Update] Found ${cartsSnapshot.size} cart(s) to check`);

  let updatedCarts = 0;
  let checkedCarts = 0;
  let matchedItems = 0;
  const cartUpdates = [];

  for (const cartDoc of cartsSnapshot.docs) {
    checkedCarts++;
    const cartData = cartDoc.data();
    const items = cartData.items || [];

    if (items.length === 0) {
      continue;
    }

    // Check if any cart items match the updated variants
    let cartNeedsUpdate = false;
    const updatedItems = items.map(item => {
      // Normalize shopifyVariantId to string for comparison
      const itemVariantId = item.shopifyVariantId ? String(item.shopifyVariantId) : null;
      
      if (itemVariantId && variantPriceMap.has(itemVariantId)) {
        const newPrice = variantPriceMap.get(itemVariantId);
        const oldPrice = typeof item.priceAtAdd === 'number' ? item.priceAtAdd : parseFloat(item.priceAtAdd) || 0;
        
        // Compare prices with tolerance for floating point precision
        const priceDiff = Math.abs(oldPrice - newPrice);
        if (priceDiff > 0.01) { // Only update if price difference is more than 1 cent
          matchedItems++;
          cartNeedsUpdate = true;
          console.log(`[Cart Update] Cart ${cartDoc.id}: Updating item ${item.productId}/${item.variantId} price ${oldPrice} -> ${newPrice}`);
          return {
            ...item,
            priceAtAdd: newPrice,
          };
        }
      }
      return item;
    });

    if (cartNeedsUpdate) {
      cartUpdates.push(
        cartDoc.ref.update({
          items: updatedItems,
          lastUpdated: FieldValue.serverTimestamp(),
        }).catch(error => {
          console.error(`[Cart Update] Failed to update cart ${cartDoc.id}:`, error);
          throw error;
        })
      );
      updatedCarts++;
    }
  }

  if (cartUpdates.length > 0) {
    try {
      await Promise.all(cartUpdates);
      console.log(`[Cart Update] ✅ Successfully updated ${updatedCarts} cart(s) with ${matchedItems} item(s)`);
    } catch (error) {
      console.error(`[Cart Update] ❌ Error updating carts:`, error);
      throw error;
    }
  } else {
    console.log(`[Cart Update] No carts needed price updates (checked ${checkedCarts} cart(s))`);
  }
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      console.error('Missing x-shopify-hmac-sha256 header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify webhook signature
    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const shopifyProduct = payload;

    // Log webhook payload structure for debugging
    console.log(`[Product Webhook] Received webhook for Shopify product: ${shopifyProduct.id}`);
    
    // Validate that title exists in payload
    if (!shopifyProduct.title) {
      console.warn(`[Product Webhook] ⚠️  WARNING: Product title is missing from webhook payload!`);
      console.warn(`[Product Webhook] Payload keys: ${Object.keys(shopifyProduct).join(', ')}`);
    }

    const db = getAdminDb();

    // Update raw Shopify item and get updated data (including marketsObject)
    let updatedShopifyItemData = null;
    try {
      const updateResult = await updateShopifyItem(db, shopifyProduct);
      if (updateResult && updateResult.data) {
        updatedShopifyItemData = updateResult.data;
        console.log(`Successfully updated Shopify item: ${shopifyProduct.id} (including marketsObject)`);
      } else {
        console.log(`Successfully updated Shopify item: ${shopifyProduct.id} (but no data returned)`);
      }
    } catch (error) {
      console.error(`Failed to update Shopify item ${shopifyProduct.id}:`, error);
      // Continue processing even if raw item update fails
    }

    // Update processed product if it exists
    // Pass the updated shopifyItem data to avoid re-fetching and ensure we have the latest marketsObject
    try {
      const updatedProductIds = await updateProcessedProduct(db, shopifyProduct, updatedShopifyItemData);
      console.log(`Successfully updated ${updatedProductIds.length} processed product(s)`);
    } catch (error) {
      console.error(`Failed to update processed product for Shopify ID ${shopifyProduct.id}:`, error);
      // Return error but don't fail completely
      return NextResponse.json(
        { ok: false, error: 'Failed to update processed product', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, productId: shopifyProduct.id });
  } catch (error) {
    console.error('Webhook processing error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification during setup)
export async function GET() {
  return NextResponse.json({ message: 'Shopify webhook endpoint is active' });
}

