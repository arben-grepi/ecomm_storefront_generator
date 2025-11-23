import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getProductMarkets, publishProductToOnlineStore } from '@/lib/shopify-admin-graphql';
import { buildMarketsArray, getMarketConfig } from '@/lib/market-utils';

// Initialize Firebase Admin SDK
function getAdminDb() {
  if (getApps().length > 0) {
    return getFirestore();
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    throw new Error('Firebase Admin credentials not configured');
  }

  return getFirestore();
}

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
    
    // Get shipping estimate: prefer Admin API rates, fallback to market config
    let shippingEstimate = '0.00';
    if (shippingRates && shippingRates[market]) {
      shippingEstimate = shippingRates[market].standard;
    } else {
      const marketConfig = getMarketConfig(market);
      shippingEstimate = marketConfig.shippingEstimate || '0.00';
    }
    
    if (marketData) {
      marketsObject[market] = {
        ...marketData,
        shippingEstimate: shippingEstimate
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
 * Update processed product if it exists across all storefronts
 */
async function updateProcessedProduct(db, shopifyProduct) {
  const storefronts = await getStorefronts(db);
  const updatedIds = [];

  const firstVariant = shopifyProduct.variants?.[0];
  const basePriceFromShopify = firstVariant ? parseFloat(firstVariant.price ?? 0) : NaN;
  const newImageUrls = extractImageUrls(shopifyProduct);

  // Search for products in each storefront
  for (const storefront of storefronts) {
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

        // Get marketsObject from shopifyItems if available
        let marketsObject = null;
        let markets = productData.markets || [];
        let publishedToOnlineStore = productData.publishedToOnlineStore;
        
        try {
          const shopifyCollection = db.collection('shopifyItems');
          const shopifySnapshot = await shopifyCollection
            .where('shopifyId', '==', shopifyProduct.id.toString())
            .limit(1)
            .get();
          
          if (!shopifySnapshot.empty) {
            const shopifyData = shopifySnapshot.docs[0].data();
            marketsObject = shopifyData.marketsObject || null;
            markets = shopifyData.markets || markets;
            publishedToOnlineStore = shopifyData.publishedToOnlineStore !== undefined 
              ? shopifyData.publishedToOnlineStore 
              : publishedToOnlineStore;
          }
        } catch (error) {
          console.warn(`[Webhook] Failed to fetch marketsObject from shopifyItems: ${error.message}`);
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

