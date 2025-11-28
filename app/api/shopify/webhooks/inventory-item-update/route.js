import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firestore-server';

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

async function fetchInventoryLevels(inventoryItemId) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!storeUrl || !accessToken) {
    console.warn('SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN not set - cannot refresh inventory levels.');
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
 * Update variants in shopifyItems collection
 * Stores location-specific inventory levels (not totals) for multi-market fulfillment
 */
/**
 * Calculate product-level stock status from variants
 */
function calculateProductStockStatus(variants) {
  if (!variants || variants.length === 0) {
    return {
      hasInStockVariants: false,
      inStockVariantCount: 0,
      totalVariantCount: 0,
    };
  }

  const inStockVariants = variants.filter(variant => {
    const hasStock = (variant.inventory_quantity || 0) > 0;
    const allowsBackorder = variant.inventory_policy === 'continue';
    return hasStock || allowsBackorder;
  });

  return {
    hasInStockVariants: inStockVariants.length > 0,
    inStockVariantCount: inStockVariants.length,
    totalVariantCount: variants.length,
  };
}

async function updateShopifyItemsVariants(db, inventoryItemId, inventoryLevels) {
  const updates = [];
  const shopifyCollection = db.collection('shopifyItems');
  const shopifyItemsSnapshot = await shopifyCollection.get();

  // Convert inventory levels to location-specific format
  const locationInventoryLevels = (inventoryLevels.levels || []).map(level => ({
    location_id: level.location_id?.toString() || level.location_id,
    location_name: level.location?.name || level.location_name || null,
    available: level.available ?? 0,
    updated_at: level.updated_at || new Date().toISOString(),
  }));

  const totalAvailable = inventoryLevels.totalAvailable;

  for (const shopifyDoc of shopifyItemsSnapshot.docs) {
    const shopifyData = shopifyDoc.data();
    const rawProduct = shopifyData.rawProduct;

    if (rawProduct && rawProduct.variants) {
      let hasUpdates = false;
      const updatedVariants = rawProduct.variants.map((variant) => {
        if (variant.inventory_item_id === inventoryItemId || variant.inventory_item_id?.toString() === inventoryItemId.toString()) {
          hasUpdates = true;
          return {
            ...variant,
            inventory_levels: locationInventoryLevels, // Store location-specific inventory
            inventory_quantity: totalAvailable, // Keep for backward compatibility
            inventoryQuantity: totalAvailable, // Keep for backward compatibility
            inventory_quantity_total: totalAvailable, // Explicit total field
            available: totalAvailable > 0 || variant.inventory_policy === 'continue',
            inventory_updated_at: new Date().toISOString(),
          };
        }
        return variant;
      });

      if (hasUpdates) {
        // Recalculate product-level stock status after variant update
        const stockStatus = calculateProductStockStatus(updatedVariants);
        
        updates.push(
          shopifyDoc.ref.update({
            'rawProduct.variants': updatedVariants,
            hasInStockVariants: stockStatus.hasInStockVariants,
            inStockVariantCount: stockStatus.inStockVariantCount,
            totalVariantCount: stockStatus.totalVariantCount,
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
async function updateStorefrontVariants(db, inventoryItemId, inventoryLevels) {
  const storefronts = await getStorefronts(db);
  const variantUpdates = [];

  // Convert inventory levels to location-specific format
  const locationInventoryLevels = (inventoryLevels.levels || []).map(level => ({
    location_id: level.location_id?.toString() || level.location_id,
    location_name: level.location?.name || level.location_name || null,
    available: level.available ?? 0,
    updated_at: level.updated_at || new Date().toISOString(),
  }));

  const totalAvailable = inventoryLevels.totalAvailable;

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
            // Update variant with location-specific inventory
            variantUpdates.push(
              variantDoc.ref.update({
                inventory_levels: locationInventoryLevels, // Store location-specific inventory
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

    const inventoryItemPayload = JSON.parse(rawBody);
    const inventoryItemId = inventoryItemPayload?.id || inventoryItemPayload?.inventory_item?.id;

    if (!inventoryItemId) {
      console.warn('Inventory item update payload missing inventory item id');
      return NextResponse.json({ ok: false, message: 'Missing inventory item id' }, { status: 200 });
    }

    console.log(`Received inventory item update webhook: inventory_item_id=${inventoryItemId}`);

    const db = getAdminDb();
    const inventoryLevels = await fetchInventoryLevels(inventoryItemId);

    if (!inventoryLevels) {
      return NextResponse.json({
        ok: true,
        inventory_item_id: inventoryItemId,
        message: 'Inventory item updated, but inventory levels could not be fetched.',
      });
    }

    console.log(`Updating inventory for item ${inventoryItemId}: ${inventoryLevels.totalAvailable} available`);

    // Update shopifyItems collection
    const shopifyItemsUpdated = await updateShopifyItemsVariants(db, inventoryItemId, inventoryLevels);
    console.log(`Updated ${shopifyItemsUpdated.length} products in shopifyItems collection`);

    // Update storefront products
    const storefrontVariantsUpdated = await updateStorefrontVariants(db, inventoryItemId, inventoryLevels);
    console.log(`Updated ${storefrontVariantsUpdated.length} variants in storefront products`);

    const totalUpdated = shopifyItemsUpdated.length + storefrontVariantsUpdated.length;

    if (totalUpdated === 0) {
      console.log(`No variants mapped to inventory item ${inventoryItemId}`);
      return NextResponse.json({
        ok: true,
        inventory_item_id: inventoryItemId,
        message: 'No variants mapped to this inventory item. Levels fetched for reference.',
        totalAvailable: inventoryLevels.totalAvailable,
      });
    }

    return NextResponse.json({
      ok: true,
      inventory_item_id: inventoryItemId,
      updatedShopifyItems: shopifyItemsUpdated.length,
      updatedStorefrontVariants: storefrontVariantsUpdated.length,
      totalUpdated,
      totalAvailable: inventoryLevels.totalAvailable,
    });
  } catch (error) {
    console.error('Inventory item webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Shopify inventory item update webhook endpoint is active' });
}
