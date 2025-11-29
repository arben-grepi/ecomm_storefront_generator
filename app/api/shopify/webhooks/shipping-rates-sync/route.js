/**
 * Shopify Shipping Rates Sync Webhook/API
 * 
 * This endpoint can be called to sync shipping rates from Shopify Admin API
 * and update all products' marketsObject with actual shipping rates.
 * 
 * Shopify doesn't have a direct webhook for shipping rate changes, so this
 * can be:
 * 1. Called manually via GET request (for testing)
 * 2. Called via scheduled job/cron
 * 3. Called after shipping rates are updated in Shopify admin
 * 
 * Usage:
 * - GET /api/shopify/webhooks/shipping-rates-sync - Sync all products
 * - POST /api/shopify/webhooks/shipping-rates-sync - Sync specific markets (body: { markets: ['FI', 'DE'] })
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-server';
import { getCollectionPath } from '@/lib/store-collections';
import { getMarketConfig } from '@/lib/market-utils';

/**
 * Get admin credentials for API calls
 */
function getAdminCredentials() {
  const storeUrl = process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!storeUrl || !accessToken) {
    throw new Error('Missing Shopify credentials');
  }
  
  return { storeUrl, accessToken };
}

/**
 * Fetch shipping rates from Shopify Admin API
 * Specifically looks for "standard" rate by name
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
                .filter(m => m.price >= 0);

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
                  allRates: methods,
                  lastUpdated: new Date().toISOString()
                };
              }
            });
          });
        });
      });
    }

    return ratesByMarket;
  } catch (error) {
    console.error(`[Shipping Sync] Failed to fetch shipping rates from Admin API: ${error.message}`);
    return null;
  }
}

/**
 * Update all products' marketsObject with latest shipping rates
 */
async function syncShippingRatesForAllProducts(marketsToSync = null) {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Firebase Admin not initialized');
  }

  console.log(`[Shipping Sync] 🚀 Starting shipping rates sync${marketsToSync ? ` for markets: ${marketsToSync.join(', ')}` : ' (all markets)'}...`);
  
  // Fetch latest shipping rates from Shopify
  const shippingRates = await fetchShippingRatesFromAdmin();
  
  if (!shippingRates || Object.keys(shippingRates).length === 0) {
    console.warn(`[Shipping Sync] ⚠️  No shipping rates found from Shopify Admin API`);
    return { updated: 0, errors: [] };
  }

  console.log(`[Shipping Sync] ✅ Fetched shipping rates for ${Object.keys(shippingRates).length} market(s):`, Object.keys(shippingRates));

  // Get all storefronts (root-level collections that have Info document)
  const collections = await db.listCollections();
  const storefronts = [];
  
  for (const collection of collections) {
    if (collection.id === 'shopifyItems' || collection.id === 'carts') continue;
    
    // Check if this collection has an Info document (indicates it's a storefront)
    const infoDoc = await collection.doc('Info').get();
    if (infoDoc.exists) {
      storefronts.push(collection.id);
    }
  }

  console.log(`[Shipping Sync] 📦 Found ${storefronts.length} storefront(s): ${storefronts.join(', ')}`);

  let totalUpdated = 0;
  const errors = [];

  // Update products in each storefront
  for (const storefront of storefronts) {
    try {
      const productsPath = getCollectionPath('products', storefront);
      let productsRef = db;
      productsPath.forEach((segment, index) => {
        if (index % 2 === 0) {
          productsRef = productsRef.collection(segment);
        } else {
          productsRef = productsRef.doc(segment);
        }
      });

      const productsSnapshot = await productsRef.get();
      console.log(`[Shipping Sync] 📦 Storefront ${storefront}: Found ${productsSnapshot.docs.length} product(s)`);

      const batch = db.batch();
      let batchCount = 0;
      const maxBatchSize = 500; // Firestore batch limit

      for (const productDoc of productsSnapshot.docs) {
        const productData = productDoc.data();
        const marketsObject = productData.marketsObject || {};

        // Update shipping rates for each market in marketsObject
        let hasUpdates = false;
        const updatedMarketsObject = { ...marketsObject };

        for (const [market, marketData] of Object.entries(marketsObject)) {
          // Skip if we're only syncing specific markets and this isn't one of them
          if (marketsToSync && !marketsToSync.includes(market)) {
            continue;
          }

          // Skip if market doesn't have shipping rate from Shopify
          if (!shippingRates[market]) {
            continue;
          }

          const rateData = shippingRates[market];
          const marketConfig = getMarketConfig(market);
          const deliveryEstimateDays = marketConfig.deliveryEstimateDays || '7-10';

          // Update shipping rate (replace estimate with actual rate)
          updatedMarketsObject[market] = {
            ...marketData,
            shippingRate: rateData.standard,
            shippingEstimate: rateData.standard, // Keep for backward compatibility
            isShippingEstimate: false, // Now it's an actual rate, not an estimate
            deliveryEstimateDays: deliveryEstimateDays,
            shippingRateLastUpdated: rateData.lastUpdated
          };

          hasUpdates = true;
        }

        // Only update if there were changes
        if (hasUpdates) {
          batch.update(productDoc.ref, {
            marketsObject: updatedMarketsObject
          });
          batchCount++;
          totalUpdated++;

          // Commit batch if it reaches the limit
          if (batchCount >= maxBatchSize) {
            await batch.commit();
            console.log(`[Shipping Sync] ✅ Committed batch of ${batchCount} products`);
            batchCount = 0;
          }
        }
      }

      // Commit remaining updates
      if (batchCount > 0) {
        await batch.commit();
        console.log(`[Shipping Sync] ✅ Committed final batch of ${batchCount} products for storefront ${storefront}`);
      }

      console.log(`[Shipping Sync] ✅ Storefront ${storefront}: Updated ${totalUpdated} product(s)`);
    } catch (error) {
      console.error(`[Shipping Sync] ❌ Failed to update products in storefront ${storefront}:`, error);
      errors.push({ storefront, error: error.message });
    }
  }

  return { updated: totalUpdated, errors };
}

/**
 * GET endpoint - Sync all products (for manual triggering or scheduled jobs)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketsParam = searchParams.get('markets');
    const marketsToSync = marketsParam ? marketsParam.split(',').map(m => m.trim().toUpperCase()) : null;

    console.log(`[Shipping Sync] 📥 GET request received${marketsToSync ? ` - Markets: ${marketsToSync.join(', ')}` : ' - All markets'}`);

    const result = await syncShippingRatesForAllProducts(marketsToSync);

    return NextResponse.json({
      success: true,
      updated: result.updated,
      errors: result.errors,
      message: `Successfully synced shipping rates for ${result.updated} product(s)`
    });
  } catch (error) {
    console.error('[Shipping Sync] ❌ Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint - Sync specific markets (for webhook or API calls)
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const marketsToSync = body.markets ? body.markets.map(m => m.trim().toUpperCase()) : null;

    console.log(`[Shipping Sync] 📥 POST request received${marketsToSync ? ` - Markets: ${marketsToSync.join(', ')}` : ' - All markets'}`);

    const result = await syncShippingRatesForAllProducts(marketsToSync);

    return NextResponse.json({
      success: true,
      updated: result.updated,
      errors: result.errors,
      message: `Successfully synced shipping rates for ${result.updated} product(s)`
    });
  } catch (error) {
    console.error('[Shipping Sync] ❌ Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

