import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET not configured in environment variables');
    return false;
  }

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
 * Get list of storefronts by checking root-level collections
 */
async function getStorefronts(db) {
  const storefronts = [];
  try {
    const collections = await db.listCollections();
    for (const coll of collections) {
      const id = coll.id;
      // Storefronts are root folders that have a 'products' subcollection
      // Skip known root collections like 'shopifyItems', 'orders', etc.
      if (id !== 'shopifyItems' && id !== 'orders' && id !== 'carts' && id !== 'users' && id !== 'userEvents') {
        try {
          const itemsSnapshot = await coll.doc('products').collection('items').limit(1).get();
          if (!itemsSnapshot.empty || id === 'LUNERA') {
            storefronts.push(id);
          }
        } catch (e) {
          // Not a storefront, skip
        }
      }
    }
  } catch (error) {
    console.error('Error getting storefronts:', error);
    return ['LUNERA'];
  }
  return storefronts.length > 0 ? storefronts : ['LUNERA'];
}

/**
 * Fetch total inventory levels across all locations for an inventory item
 */
async function fetchTotalInventoryLevels(inventoryItemId) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!storeUrl || !accessToken) {
    console.warn('SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN not set - cannot fetch total inventory levels.');
    return null;
  }

  try {
    const response = await fetch(
      `https://${storeUrl}/admin/api/2025-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch inventory levels from Shopify', await response.text());
      return null;
    }

    const data = await response.json();
    if (!data.inventory_levels || data.inventory_levels.length === 0) {
      return null;
    }

    const totalAvailable = data.inventory_levels.reduce((sum, level) => sum + (level.available ?? 0), 0);
    return {
      totalAvailable,
      levels: data.inventory_levels,
    };
  } catch (error) {
    console.error('Error fetching inventory levels from Shopify:', error);
    return null;
  }
}

/**
 * Update variants in shopifyItems collection
 * Stores location-specific inventory levels (not totals) for multi-market fulfillment
 */
async function updateShopifyItemsVariants(db, inventoryItemId, locationId, locationAvailable, allInventoryLevels = []) {
  const updates = [];
  const shopifyCollection = db.collection('shopifyItems');
  const shopifyItemsSnapshot = await shopifyCollection.get();

  // Build location-specific inventory levels array
  const locationInventoryLevels = allInventoryLevels.length > 0 
    ? allInventoryLevels.map(level => ({
        location_id: level.location_id?.toString() || level.location_id,
        location_name: level.location?.name || level.location_name || null,
        available: level.available ?? 0,
        updated_at: level.updated_at || new Date().toISOString(),
      }))
    : [
        {
          location_id: locationId?.toString() || locationId,
          available: locationAvailable ?? 0,
          updated_at: new Date().toISOString(),
        }
      ];

  // Calculate total for backward compatibility (optional)
  const totalAvailable = locationInventoryLevels.reduce((sum, level) => sum + (level.available || 0), 0);

  for (const shopifyDoc of shopifyItemsSnapshot.docs) {
    const shopifyData = shopifyDoc.data();
    const rawProduct = shopifyData.rawProduct;

    if (rawProduct && rawProduct.variants) {
      let hasUpdates = false;
      const updatedVariants = rawProduct.variants.map((variant) => {
        if (variant.inventory_item_id === inventoryItemId || variant.inventory_item_id?.toString() === inventoryItemId.toString()) {
          hasUpdates = true;
          
          // Merge with existing inventory_levels (update or add location)
          const existingLevels = variant.inventory_levels || [];
          const updatedLevels = [...existingLevels];
          
          // Update or add this location's inventory
          const locationIndex = updatedLevels.findIndex(
            level => level.location_id?.toString() === (locationId?.toString() || locationId)
          );
          
          if (locationIndex >= 0) {
            // Update existing location
            updatedLevels[locationIndex] = {
              ...updatedLevels[locationIndex],
              available: locationAvailable ?? 0,
              updated_at: new Date().toISOString(),
            };
          } else {
            // Add new location
            updatedLevels.push({
              location_id: locationId?.toString() || locationId,
              location_name: null,
              available: locationAvailable ?? 0,
              updated_at: new Date().toISOString(),
            });
          }

          return {
            ...variant,
            inventory_levels: updatedLevels,
            inventory_quantity: totalAvailable, // Keep for backward compatibility
            inventoryQuantity: totalAvailable, // Keep for backward compatibility
            inventory_quantity_total: totalAvailable, // Explicit total field
            inventory_updated_at: new Date().toISOString(),
          };
        }
        return variant;
      });

      if (hasUpdates) {
        // Recalculate product-level stock status after variant update
        const hasInStockVariants = updatedVariants.some(variant => {
          const hasStock = (variant.inventory_quantity || 0) > 0;
          const allowsBackorder = variant.inventory_policy === 'continue';
          return hasStock || allowsBackorder;
        });
        const inStockVariantCount = updatedVariants.filter(variant => {
          const hasStock = (variant.inventory_quantity || 0) > 0;
          const allowsBackorder = variant.inventory_policy === 'continue';
          return hasStock || allowsBackorder;
        }).length;
        
        updates.push(
          shopifyDoc.ref.update({
            'rawProduct.variants': updatedVariants,
            hasInStockVariants,
            inStockVariantCount,
            totalVariantCount: updatedVariants.length,
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
      }
    }
  }

  return Promise.all(updates);
}

/**
 * Find and update variants in storefront products
 * Stores location-specific inventory levels for market-based availability checks
 */
async function updateStorefrontVariants(db, inventoryItemId, locationId, locationAvailable, allInventoryLevels = []) {
  const storefronts = await getStorefronts(db);
  const variantUpdates = [];

  // Build location-specific inventory levels array
  const locationInventoryLevels = allInventoryLevels.length > 0 
    ? allInventoryLevels.map(level => ({
        location_id: level.location_id?.toString() || level.location_id,
        location_name: level.location?.name || level.location_name || null,
        available: level.available ?? 0,
        updated_at: level.updated_at || new Date().toISOString(),
      }))
    : [
        {
          location_id: locationId?.toString() || locationId,
          available: locationAvailable ?? 0,
          updated_at: new Date().toISOString(),
        }
      ];

  // Calculate total for backward compatibility
  const totalAvailable = locationInventoryLevels.reduce((sum, level) => sum + (level.available || 0), 0);

  for (const storefront of storefronts) {
    try {
      const productsCollection = db.collection(storefront).doc('products').collection('items');
      const allProductsSnapshot = await productsCollection.get();

      for (const productDoc of allProductsSnapshot.docs) {
        const productData = productDoc.data();
        
        // Skip if not a Shopify product
        if (!productData.sourceShopifyId) {
          continue;
        }

        const variantsCollection = productDoc.ref.collection('variants');
        const variantsSnapshot = await variantsCollection.get();

        for (const variantDoc of variantsSnapshot.docs) {
          const variantData = variantDoc.data();

          // Match by shopifyInventoryItemId
          if (
            variantData.shopifyInventoryItemId?.toString() === inventoryItemId.toString() ||
            variantData.shopifyInventoryItemId === inventoryItemId
          ) {
            // Merge with existing inventory_levels (update or add location)
            const existingLevels = variantData.inventory_levels || [];
            const updatedLevels = [...existingLevels];
            
            // Update or add this location's inventory
            const locationIndex = updatedLevels.findIndex(
              level => level.location_id?.toString() === (locationId?.toString() || locationId)
            );
            
            if (locationIndex >= 0) {
              // Update existing location
              updatedLevels[locationIndex] = {
                ...updatedLevels[locationIndex],
                available: locationAvailable ?? 0,
                updated_at: new Date().toISOString(),
              };
            } else {
              // Add new location
              updatedLevels.push({
                location_id: locationId?.toString() || locationId,
                location_name: null,
                available: locationAvailable ?? 0,
                updated_at: new Date().toISOString(),
              });
            }

            // Update variant with location-specific inventory
            variantUpdates.push(
              variantDoc.ref.update({
                inventory_levels: updatedLevels,
                stock: totalAvailable, // Keep for backward compatibility
                updatedAt: FieldValue.serverTimestamp(),
              })
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error updating variants in storefront ${storefront}:`, error);
    }
  }

  return Promise.all(variantUpdates);
}

/**
 * Handle inventory_levels/update webhook from Shopify
 * This webhook is triggered when inventory quantities change at a location
 */
export async function POST(request) {
  try {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      console.error('Missing x-shopify-hmac-sha256 header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inventoryLevel = JSON.parse(rawBody);
    const inventoryItemId = inventoryLevel?.inventory_item_id;
    const locationAvailable = inventoryLevel?.available ?? 0; // Available at this specific location
    const locationId = inventoryLevel?.location_id;

    // DEBUG: Log full webhook payload to identify DSers location ID
    console.log('[Webhook Debug] Received inventory_levels/update:', {
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      location_name: inventoryLevel?.location?.name || null,
      available: locationAvailable,
      updated_at: inventoryLevel?.updated_at || null,
      full_payload: inventoryLevel, // Full payload for debugging
    });

    if (!inventoryItemId) {
      console.warn('Inventory level update payload missing inventory_item_id');
      return NextResponse.json({ ok: false, message: 'Missing inventory_item_id' }, { status: 200 });
    }

    if (!locationId) {
      console.warn('[Webhook Debug] Missing location_id in payload - this is unexpected');
    }

    console.log(`Received inventory_levels/update webhook: inventory_item_id=${inventoryItemId}, location_id=${locationId}, available=${locationAvailable}`);

    const db = getAdminDb();

    // Fetch all inventory levels to get complete location data (for location names, etc.)
    let allInventoryLevels = null;
    try {
      allInventoryLevels = await fetchTotalInventoryLevels(inventoryItemId);
      if (!allInventoryLevels) {
        console.warn(`[Webhook] Could not fetch all inventory levels for item ${inventoryItemId}, using webhook data only`);
      }
    } catch (error) {
      console.error(`[Webhook] Error fetching all inventory levels for item ${inventoryItemId}:`, error);
      // Continue with webhook data only - this location's update is still valid
    }
    
    const inventoryLevels = allInventoryLevels?.levels ?? [];
    
    // If we couldn't fetch all levels, at least use the location from the webhook
    if (inventoryLevels.length === 0 && locationId) {
      inventoryLevels.push({
        location_id: locationId,
        location_name: inventoryLevel?.location?.name || null,
        available: locationAvailable,
        updated_at: inventoryLevel?.updated_at || new Date().toISOString(),
      });
    }

    // Update shopifyItems collection with location-specific inventory
    let shopifyItemsUpdated = [];
    try {
      shopifyItemsUpdated = await updateShopifyItemsVariants(
        db, 
        inventoryItemId, 
        locationId, 
        locationAvailable, 
        inventoryLevels
      );
      console.log(`✅ Updated ${shopifyItemsUpdated.length} products in shopifyItems collection (location ${locationId}: ${locationAvailable} available)`);
    } catch (error) {
      console.error(`[Webhook] Error updating shopifyItems for inventory_item_id ${inventoryItemId}:`, error);
    }

    // Update storefront products with location-specific inventory
    let storefrontVariantsUpdated = [];
    try {
      storefrontVariantsUpdated = await updateStorefrontVariants(
        db, 
        inventoryItemId, 
        locationId, 
        locationAvailable, 
        inventoryLevels
      );
      console.log(`✅ Updated ${storefrontVariantsUpdated.length} variants in storefront products (location ${locationId}: ${locationAvailable} available)`);
    } catch (error) {
      console.error(`[Webhook] Error updating storefront variants for inventory_item_id ${inventoryItemId}:`, error);
    }

    const totalUpdated = shopifyItemsUpdated.length + storefrontVariantsUpdated.length;

    return NextResponse.json({
      ok: true,
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      location_available: locationAvailable,
      updatedShopifyItems: shopifyItemsUpdated.length,
      updatedStorefrontVariants: storefrontVariantsUpdated.length,
      totalUpdated,
      message: `Updated inventory for location ${locationId}: ${locationAvailable} available`,
    });
  } catch (error) {
    console.error('Inventory levels webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Shopify inventory_levels/update webhook endpoint is active' });
}

