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
async function fetchProductMarketData(productId, market) {
  try {
    const { fetchProductForMarket } = await import('@/lib/shopify-storefront-api');
    const productGid = `gid://shopify/Product/${productId}`;
    const productData = await fetchProductForMarket(productGid, market);
    
    if (!productData) {
      return null;
    }
    
    return {
      available: productData.availableForSale || false,
      price: productData.priceRange?.minVariantPrice?.amount || '0.00',
      currency: productData.priceRange?.minVariantPrice?.currencyCode || 'EUR'
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
        price: '0.00',
        currency: 'EUR',
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
    console.log(`[Product Webhook] Updating markets/publication status for product: ${shopifyProduct.id} (${shopifyProduct.title}), Existing Markets: [${markets.join(', ') || 'none'}], Online Store: ${publishedToOnlineStore ? '✅' : '❌'}`);
    const marketInfo = await getProductMarkets(productGid);
    markets = buildMarketsArray(marketInfo);
    publishedToOnlineStore = marketInfo.publishedToOnlineStore || false;
    console.log(`[Product Webhook] Product ${shopifyProduct.id} updated - Markets: [${markets.join(', ') || 'none'}], Online Store: ${publishedToOnlineStore ? '✅' : '❌'}`);
    
    if (!publishedToOnlineStore) {
      console.warn(`[Product Webhook] ⚠️  Product ${shopifyProduct.id} (${shopifyProduct.title}) is NOT published to Online Store - will not be accessible via Storefront API`);
    }
    
    // Fetch marketsObject with market-specific prices and shipping if product is published
    if (publishedToOnlineStore && markets.length > 0) {
      try {
        console.log(`[Product Webhook] Fetching market-specific data (prices/shipping) for ${markets.length} market(s)...`);
        const shippingRates = await fetchShippingRatesFromAdmin();
        marketsObject = await buildMarketsObjectForWebhook(shopifyProduct.id, markets, shippingRates);
        console.log(`[Product Webhook] ✅ Updated marketsObject with latest prices and shipping rates`);
      } catch (error) {
        console.warn(`[Product Webhook] ⚠️  Failed to fetch marketsObject: ${error.message}`);
        // Keep existing marketsObject if fetch fails
      }
    }
  } catch (error) {
    console.error(`[Product Webhook] Failed to get markets/publication status for product ${shopifyProduct.id}:`, error.message || error);
    // Keep existing markets/publication status if query fails
  }
  
  const updateData = {
    title: shopifyProduct.title,
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
    rawProduct: shopifyProduct,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(updateData, { merge: true });
  console.log(`Updated Shopify item: ${docRef.id}`);
  
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
    } catch (error) {
      console.error(`[Product Webhook] ⚠️  Failed to auto-publish product ${shopifyProduct.id} to Online Store:`, error.message || error);
      // Don't throw - webhook should still succeed even if auto-publish fails
    }
  }
  
  return docRef.id;
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
 */
async function updateProcessedProduct(db, shopifyProduct) {
  // First, get the shopifyItems document to check which storefronts should contain this product
  const shopifyCollection = db.collection('shopifyItems');
  const shopifySnapshot = await shopifyCollection
    .where('shopifyId', '==', shopifyProduct.id.toString())
    .limit(1)
    .get();
  
  let targetStorefronts = null; // null means update all storefronts (backward compatibility)
  let shopifyItemData = null;
  
  if (!shopifySnapshot.empty) {
    shopifyItemData = shopifySnapshot.docs[0].data();
    // If storefronts array exists and is not empty, only update those storefronts
    // This respects admin decisions about which storefronts should contain the product
    if (shopifyItemData.storefronts && Array.isArray(shopifyItemData.storefronts) && shopifyItemData.storefronts.length > 0) {
      targetStorefronts = shopifyItemData.storefronts;
      console.log(`[Webhook] Product ${shopifyProduct.id} has explicit storefronts: [${targetStorefronts.join(', ')}]`);
    } else {
      console.log(`[Webhook] Product ${shopifyProduct.id} has no explicit storefronts, will update all storefronts where product exists`);
    }
  } else {
    console.log(`[Webhook] Product ${shopifyProduct.id} not found in shopifyItems, will update all storefronts where product exists`);
  }

  // Get all storefronts (for fallback or if targetStorefronts is null)
  const allStorefronts = await getStorefronts(db);
  // Use target storefronts if specified, otherwise use all storefronts (backward compatibility)
  const storefrontsToUpdate = targetStorefronts || allStorefronts;
  
  const updatedIds = [];

  const firstVariant = shopifyProduct.variants?.[0];
  const basePriceFromShopify = firstVariant ? parseFloat(firstVariant.price ?? 0) : NaN;
  const newImageUrls = extractImageUrls(shopifyProduct);

  // Search for products in each target storefront
  for (const storefront of storefrontsToUpdate) {
    try {
      const productsCollection = db.collection(storefront).doc('products').collection('items');

      const snapshot = await productsCollection
        .where('sourceShopifyId', '==', shopifyProduct.id.toString())
        .get();

      if (snapshot.empty) {
        continue; // No products in this storefront
      }

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

        const productUpdate = {
          basePrice: normalizedBasePrice,
          images: newImageUrls.length > 0 ? newImageUrls : productData.images || [],
          ...(markets.length > 0 ? { markets } : {}),
          ...(marketsObject && Object.keys(marketsObject).length > 0 ? { marketsObject } : {}),
          ...(publishedToOnlineStore !== undefined ? { publishedToOnlineStore } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        };

        await productRef.update(productUpdate);

        if (shopifyProduct.variants && shopifyProduct.variants.length > 0) {
          const allVariantsSnapshot = await variantsCollection.get();
          const existingVariants = allVariantsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          for (const shopifyVariant of shopifyProduct.variants) {
            let variantRef = null;

            if (shopifyVariant.sku) {
              const matchedBySku = existingVariants.find((v) => v.sku === shopifyVariant.sku);
              if (matchedBySku) {
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
                variantRef = variantsCollection.doc(matchedByAttributes.id);
              }
            }

            if (variantRef) {
              // Get variant-specific images from Shopify
              const variantImageUrls = (shopifyProduct.images || [])
                .filter((img) => {
                  const imgVariantIds = img.variant_ids || [];
                  return imgVariantIds.includes(shopifyVariant.id);
                })
                .map((img) => (typeof img === 'object' ? img.src : img))
                .filter(Boolean);
              
              // Combine variant-specific images with main product images
              const allVariantImages = variantImageUrls.length > 0
                ? [...new Set([...variantImageUrls, ...newImageUrls])]
                : newImageUrls;

              const variantPrice = shopifyVariant.price != null ? parseFloat(shopifyVariant.price) : NaN;
              
              await variantRef.update({
                shopifyVariantId: shopifyVariant.id.toString(), // Always preserve Shopify variant ID
                shopifyInventoryItemId: shopifyVariant.inventory_item_id || undefined, // Preserve inventory item ID
                stock: shopifyVariant.inventory_quantity || 0,
                priceOverride: Number.isFinite(variantPrice) ? variantPrice : null,
                images: allVariantImages.length > 0 ? allVariantImages : undefined,
                updatedAt: FieldValue.serverTimestamp(),
              });
              console.log(`Updated variant: ${variantRef.id} (shopifyVariantId: ${shopifyVariant.id}, stock: ${shopifyVariant.inventory_quantity || 0}, images: ${allVariantImages.length})`);
            } else {
              console.log(`Could not match Shopify variant ${shopifyVariant.id} to existing variant`);
            }
          }
        }

        console.log(`Updated processed product: ${productDoc.id} in storefront: ${storefront}`);
        updatedIds.push({ id: productDoc.id, storefront });
      }
    } catch (error) {
      console.error(`Error updating products in storefront ${storefront}:`, error);
      // Continue with other storefronts
    }
  }

  return updatedIds;
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

    console.log(`Received webhook for Shopify product: ${shopifyProduct.id} (${shopifyProduct.title})`);

    const db = getAdminDb();

    // Update raw Shopify item
    try {
      await updateShopifyItem(db, shopifyProduct);
      console.log(`Successfully updated Shopify item: ${shopifyProduct.id}`);
    } catch (error) {
      console.error(`Failed to update Shopify item ${shopifyProduct.id}:`, error);
      // Continue processing even if raw item update fails
    }

    // Update processed product if it exists
    try {
      const updatedProductIds = await updateProcessedProduct(db, shopifyProduct);
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

