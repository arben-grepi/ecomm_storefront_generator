/**
 * Shopify Shipping Rates Sync Webhook/API
 * 
 * This endpoint syncs shipping rates from Shopify Admin API to a single Firestore document.
 * Much simpler than updating all products!
 * 
 * Shopify doesn't have a direct webhook for shipping rate changes, so this
 * can be:
 * 1. Called manually via GET request (for testing)
 * 2. Called via scheduled job/cron
 * 3. Called after shipping rates are updated in Shopify admin
 * 
 * Usage:
 * - GET /api/shopify/webhooks/shipping-rates-sync - Sync all rates
 * - POST /api/shopify/webhooks/shipping-rates-sync - Sync specific markets (body: { markets: ['FI', 'DE'] })
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-server';

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

    // Parse shipping rates by country code - using same logic as check-shipping-rates.js script
    const ratesByMarket = {};

    if (data?.deliveryProfiles?.edges) {
      data.deliveryProfiles.edges.forEach(profile => {
        const locationGroups = profile.node.profileLocationGroups || [];
        
        locationGroups.forEach(group => {
          const zones = group.locationGroupZones?.edges || [];
          
          zones.forEach(zoneEdge => {
            const zone = zoneEdge.node;
            const zoneName = zone.zone?.name || 'Unnamed Zone';
            const countries = zone.zone?.countries || [];

            // Get active shipping methods with prices (same as script)
            const methods = (zone.methodDefinitions?.edges || [])
              .filter(m => m.node.active && m.node.rateProvider)
              .map(m => ({
                name: m.node.name,
                price: parseFloat(m.node.rateProvider.price?.amount || 0),
                currency: m.node.rateProvider.price?.currencyCode || 'EUR'
              }))
              .filter(m => m.price >= 0);

            if (methods.length === 0) {
              return; // Skip zone if no methods
            }

            // Find standard rate (by name or lowest price) - same logic as script
            const standardRate = methods.find(m => 
              m.name.toLowerCase().includes('standard')
            ) || methods.sort((a, b) => a.price - b.price)[0];

            // Find express rate (highest price, or one with "express" in name)
            const expressRate = methods.find(m => 
              m.name.toLowerCase().includes('express')
            );
            const sortedByPrice = methods.sort((a, b) => a.price - b.price);
            const expressPrice = expressRate
              ? expressRate.price.toFixed(2)
              : sortedByPrice[sortedByPrice.length - 1]?.price.toFixed(2) || standardRate.price.toFixed(2);

            // Process each country in this zone
            countries.forEach(country => {
              const countryCode = country.code?.countryCode;
              
              if (!countryCode) return;

              // Use the same rate for all countries in this zone (same as script logic)
              ratesByMarket[countryCode] = {
                standard: standardRate.price.toFixed(2),
                express: expressPrice,
                currency: standardRate.currency,
                hasActualRates: true,
                allRates: methods,
                lastUpdated: new Date().toISOString()
              };
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
 * Sync shipping rates to a single Firestore document
 * Much simpler than updating all products!
 */
async function syncShippingRates(marketsToSync = null) {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Firebase Admin not initialized');
  }

  console.log(`[Shipping Sync] 🚀 Starting shipping rates sync${marketsToSync ? ` for markets: ${marketsToSync.join(', ')}` : ' (all markets)'}...`);
  
  // Fetch latest shipping rates from Shopify
  const shippingRates = await fetchShippingRatesFromAdmin();
  
  if (!shippingRates || Object.keys(shippingRates).length === 0) {
    console.warn(`[Shipping Sync] ⚠️  No shipping rates found from Shopify Admin API`);
    return { updated: false, errors: [] };
  }

  console.log(`[Shipping Sync] ✅ Fetched shipping rates for ${Object.keys(shippingRates).length} market(s):`, Object.keys(shippingRates));

  try {
    // Store rates in a simple format: { FI: { standard: "2.90", currency: "EUR" }, ... }
    const ratesDocument = {};
    
    for (const [countryCode, rateData] of Object.entries(shippingRates)) {
      // Skip if we're only syncing specific markets
      if (marketsToSync && !marketsToSync.includes(countryCode)) {
        continue;
      }
      
      ratesDocument[countryCode] = {
        standard: rateData.standard,
        express: rateData.express,
        currency: rateData.currency,
        lastUpdated: rateData.lastUpdated || new Date().toISOString()
      };
    }

    // Update single document: shippingRates/rates
    const shippingRatesRef = db.collection('shippingRates').doc('rates');
    await shippingRatesRef.set(ratesDocument, { merge: true });

    console.log(`[Shipping Sync] ✅ Updated shipping rates document with ${Object.keys(ratesDocument).length} country(ies)`);
    
    return { updated: true, countries: Object.keys(ratesDocument), errors: [] };
  } catch (error) {
    console.error(`[Shipping Sync] ❌ Failed to update shipping rates:`, error);
    return { updated: false, errors: [{ error: error.message }] };
  }
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

    const result = await syncShippingRates(marketsToSync);

    return NextResponse.json({
      success: true,
      updated: result.updated,
      countries: result.countries || [],
      errors: result.errors,
      message: result.updated ? `Successfully synced shipping rates for ${result.countries?.length || 0} countr${result.countries?.length === 1 ? 'y' : 'ies'}` : 'No rates to sync'
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

    const result = await syncShippingRates(marketsToSync);

    return NextResponse.json({
      success: true,
      updated: result.updated,
      countries: result.countries || [],
      errors: result.errors,
      message: result.updated ? `Successfully synced shipping rates for ${result.countries?.length || 0} countr${result.countries?.length === 1 ? 'y' : 'ies'}` : 'No rates to sync'
    });
  } catch (error) {
    console.error('[Shipping Sync] ❌ Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

