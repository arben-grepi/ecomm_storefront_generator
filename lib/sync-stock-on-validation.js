/**
 * Stock Sync Utility for Validation
 * 
 * When validation detects stock discrepancies, this utility syncs the stock
 * from Shopify to our database, similar to how webhooks do it.
 * 
 * This ensures that if webhooks were disabled or missed updates, we can
 * self-heal by syncing stock when validation detects issues.
 */

import { getAdminDb } from '@/lib/firestore-server';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Get inventory item ID from Shopify variant ID
 * This is a fallback - prefer passing inventoryItemId directly from validation results
 * @param {string|number} shopifyVariantId - Shopify variant ID
 * @returns {Promise<string|null>} Inventory item ID or null
 */
async function getInventoryItemIdFromVariant(shopifyVariantId) {
  const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN } = getShopifyCredentials();
  const SHOPIFY_API_VERSION = '2025-10';
  
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    console.warn('[sync-stock] SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN not set');
    return null;
  }

  try {
    const variantUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/variants/${shopifyVariantId}.json`;
    const response = await fetch(variantUrl, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
    });

    if (!response.ok) {
      // If variant not found (404), it might have been deleted from Shopify
      // This can happen if product was removed
      if (response.status === 404) {
        console.warn(`[sync-stock] Variant ${shopifyVariantId} not found in Shopify (may have been deleted)`);
      } else {
        console.error(`[sync-stock] Failed to fetch variant ${shopifyVariantId}: ${response.status}`);
      }
      return null;
    }

    const data = await response.json();
    const inventoryItemId = data.variant?.inventory_item_id;
    return inventoryItemId ? inventoryItemId.toString() : null;
  } catch (error) {
    console.error(`[sync-stock] Error fetching variant ${shopifyVariantId}:`, error);
    return null;
  }
}

/**
 * Fetch inventory levels from Shopify
 * @param {string} inventoryItemId - Inventory item ID
 * @returns {Promise<Object|null>} Inventory levels or null
 */
async function fetchInventoryLevels(inventoryItemId) {
  const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN } = getShopifyCredentials();
  
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    console.warn('[sync-stock] SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN not set');
    return null;
  }

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2025-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`[sync-stock] Failed to fetch inventory levels for ${inventoryItemId}: ${response.status}`);
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
    console.error(`[sync-stock] Error fetching inventory levels:`, error);
    return null;
  }
}

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

/**
 * Calculate product-level stock status from variants (for storefront products)
 */
function calculateProductStockFromVariants(variants) {
  if (!variants || variants.length === 0) {
    return {
      totalStock: 0,
      hasInStockVariants: false,
      inStockVariantCount: 0,
      totalVariantCount: 0,
    };
  }

  let totalStock = 0;
  let inStockVariantCount = 0;

  variants.forEach((variant) => {
    const stock = variant.stock || variant.inventory_quantity || variant.inventoryQuantity || 0;
    totalStock += stock;
    
    const hasStock = stock > 0;
    const allowsBackorder = variant.inventory_policy === 'continue';
    if (hasStock || allowsBackorder) {
      inStockVariantCount++;
    }
  });

  return {
    totalStock,
    hasInStockVariants: inStockVariantCount > 0,
    inStockVariantCount,
    totalVariantCount: variants.length,
  };
}

/**
 * Get Shopify credentials
 */
function getShopifyCredentials() {
  return {
    SHOPIFY_STORE_URL: process.env.SHOPIFY_STORE_URL,
    SHOPIFY_ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN,
  };
}

/**
 * Get list of storefronts
 */
async function getStorefronts(db) {
  const storefronts = [];
  try {
    const collections = await db.listCollections();
    for (const coll of collections) {
      const id = coll.id;
      if (id !== 'shopifyItems' && id !== 'orders' && id !== 'carts' && id !== 'users' && id !== 'userEvents' && id !== 'shippingRates') {
        try {
          const itemsSnapshot = await coll.doc('products').collection('items').limit(1).get();
          if (!itemsSnapshot.empty) {
            storefronts.push(id);
          }
        } catch (e) {
          // Not a storefront, skip
        }
      }
    }
  } catch (error) {
    console.error('[sync-stock] Error getting storefronts:', error);
    return ['LUNERA'];
  }
  return storefronts.length > 0 ? storefronts : ['LUNERA'];
}

/**
 * Update variants in shopifyItems collection
 */
async function updateShopifyItemsVariants(db, inventoryItemId, inventoryLevels) {
  const updates = [];
  const updatedProductIds = [];
  const shopifyCollection = db.collection('shopifyItems');
  const shopifyItemsSnapshot = await shopifyCollection.get();

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
            inventory_levels: locationInventoryLevels,
            inventory_quantity: totalAvailable,
            inventoryQuantity: totalAvailable,
            inventory_quantity_total: totalAvailable,
            available: totalAvailable > 0 || variant.inventory_policy === 'continue',
            inventory_updated_at: new Date().toISOString(),
          };
        }
        return variant;
      });

      if (hasUpdates) {
        const shopifyId = shopifyData.shopifyId || rawProduct.id;
        if (shopifyId) {
          updatedProductIds.push({
            shopifyId: shopifyId.toString(),
            storefronts: shopifyData.storefronts || null,
          });
        }
        
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

  await Promise.all(updates);
  return updatedProductIds;
}

/**
 * Update variants in storefront products
 */
async function updateStorefrontVariants(db, inventoryItemId, inventoryLevels, updatedProducts = []) {
  const productStorefrontsMap = new Map();
  updatedProducts.forEach(({ shopifyId, storefronts }) => {
    if (shopifyId && storefronts && Array.isArray(storefronts) && storefronts.length > 0) {
      productStorefrontsMap.set(shopifyId.toString(), storefronts);
    }
  });

  const allStorefronts = await getStorefronts(db);
  const storefrontsToCheck = productStorefrontsMap.size > 0
    ? [...new Set(Array.from(productStorefrontsMap.values()).flat())]
    : allStorefronts;

  const variantUpdates = [];
  const productUpdates = [];

  const locationInventoryLevels = (inventoryLevels.levels || []).map(level => ({
    location_id: level.location_id?.toString() || level.location_id,
    location_name: level.location?.name || level.location_name || null,
    available: level.available ?? 0,
    updated_at: level.updated_at || new Date().toISOString(),
  }));

  const totalAvailable = inventoryLevels.totalAvailable;

  for (const storefront of storefrontsToCheck) {
    try {
      const productsCollection = db.collection(storefront).doc('products').collection('items');
      const allProductsSnapshot = await productsCollection.get();

      for (const productDoc of allProductsSnapshot.docs) {
        const productData = productDoc.data();
        
        if (!productData.sourceShopifyId) {
          continue;
        }

        if (productStorefrontsMap.size > 0) {
          const allowedStorefronts = productStorefrontsMap.get(productData.sourceShopifyId.toString());
          if (!allowedStorefronts || !allowedStorefronts.includes(storefront)) {
            continue;
          }
        }

        const variantsCollection = productDoc.ref.collection('variants');
        const variantsSnapshot = await variantsCollection.get();
        const allVariants = variantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let productNeedsUpdate = false;

        for (const variantDoc of variantsSnapshot.docs) {
          const variantData = variantDoc.data();

          if (
            variantData.shopifyInventoryItemId?.toString() === inventoryItemId.toString() ||
            variantData.shopifyInventoryItemId === inventoryItemId
          ) {
            variantUpdates.push(
              variantDoc.ref.update({
                inventory_levels: locationInventoryLevels,
                stock: totalAvailable,
                updatedAt: FieldValue.serverTimestamp(),
              })
            );
            
            const variantIndex = allVariants.findIndex(v => v.id === variantDoc.id);
            if (variantIndex >= 0) {
              allVariants[variantIndex] = {
                ...allVariants[variantIndex],
                stock: totalAvailable,
                inventory_levels: locationInventoryLevels,
              };
            }
            productNeedsUpdate = true;
          }
        }

        if (productNeedsUpdate) {
          const stockStatus = calculateProductStockFromVariants(allVariants);
          productUpdates.push(
            productDoc.ref.update({
              totalStock: stockStatus.totalStock,
              hasInStockVariants: stockStatus.hasInStockVariants,
              inStockVariantCount: stockStatus.inStockVariantCount,
              totalVariantCount: stockStatus.totalVariantCount,
              updatedAt: FieldValue.serverTimestamp(),
            })
          );
        }
      }
    } catch (error) {
      console.error(`[sync-stock] Error updating variants in storefront ${storefront}:`, error);
    }
  }

  await Promise.all(variantUpdates);
  await Promise.all(productUpdates);
  
  return { variantCount: variantUpdates.length, productCount: productUpdates.length };
}

/**
 * Get product info from shopifyItems collection by variant ID
 * This is useful when variant is already deleted from storefronts
 */
async function getProductInfoFromShopifyItems(shopifyVariantId) {
  const db = getAdminDb();
  if (!db) {
    return null;
  }

  try {
    const shopifyCollection = db.collection('shopifyItems');
    const shopifyItemsSnapshot = await shopifyCollection.get();
    
    for (const shopifyDoc of shopifyItemsSnapshot.docs) {
      const shopifyData = shopifyDoc.data();
      const rawProduct = shopifyData.rawProduct;
      
      if (rawProduct && rawProduct.variants) {
        const variant = rawProduct.variants.find(
          v => v.id?.toString() === shopifyVariantId.toString()
        );
        
        if (variant) {
          const inventoryItemId = variant.inventory_item_id;
          const shopifyProductId = rawProduct.id || shopifyData.shopifyId;
          
          return {
            inventoryItemId: inventoryItemId?.toString(),
            shopifyProductId: shopifyProductId?.toString(),
            allVariants: rawProduct.variants.map(v => ({
              id: v.id?.toString(),
              inventory_item_id: v.inventory_item_id?.toString(),
            })),
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[sync-stock] Error looking up product in shopifyItems:`, error);
    return null;
  }
}

/**
 * Get inventory item ID from Firestore variant document
 * Fallback method when Shopify API is unavailable
 * Also returns product information
 */
async function getInventoryItemIdFromFirestore(shopifyVariantId) {
  const db = getAdminDb();
  if (!db) {
    return null;
  }

  try {
    // First check shopifyItems collection (authoritative source)
    const shopifyCollection = db.collection('shopifyItems');
    const shopifyItemsSnapshot = await shopifyCollection.get();
    
    for (const shopifyDoc of shopifyItemsSnapshot.docs) {
      const shopifyData = shopifyDoc.data();
      const rawProduct = shopifyData.rawProduct;
      
      if (rawProduct && rawProduct.variants) {
        const variant = rawProduct.variants.find(
          v => v.id?.toString() === shopifyVariantId.toString()
        );
        
        if (variant) {
          const inventoryItemId = variant.inventory_item_id;
          const shopifyProductId = rawProduct.id || shopifyData.shopifyId;
          if (inventoryItemId) {
            console.log(`[sync-stock] ✅ Found variant in shopifyItems: productId=${shopifyProductId}, inventoryItemId=${inventoryItemId}`);
            return {
              inventoryItemId: inventoryItemId.toString(),
              shopifyProductId: shopifyProductId?.toString(),
              allVariants: rawProduct.variants.map(v => ({
                id: v.id?.toString(),
                inventory_item_id: v.inventory_item_id?.toString(),
              })),
            };
          }
        }
      }
    }
    
    // Fallback: Search through storefronts
    const storefronts = await getStorefronts(db);
    
    for (const storefront of storefronts) {
      try {
        const productsCollection = db.collection(storefront).doc('products').collection('items');
        const productsSnapshot = await productsCollection.get();
        
        for (const productDoc of productsSnapshot.docs) {
          const productData = productDoc.data();
          const variantsCollection = productDoc.ref.collection('variants');
          const variantsSnapshot = await variantsCollection.where('shopifyVariantId', '==', shopifyVariantId.toString()).get();
          
          if (!variantsSnapshot.empty) {
            const variantData = variantsSnapshot.docs[0].data();
            const inventoryItemId = variantData.shopifyInventoryItemId;
            const shopifyProductId = productData.sourceShopifyId;
            if (inventoryItemId) {
              console.log(`[sync-stock] ✅ Found inventoryItemId ${inventoryItemId} in Firestore for variant ${shopifyVariantId}`);
              return {
                inventoryItemId: inventoryItemId.toString(),
                shopifyProductId: shopifyProductId?.toString(),
              };
            }
          }
        }
      } catch (error) {
        // Continue to next storefront
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[sync-stock] Error looking up inventoryItemId in Firestore:`, error);
    return null;
  }
}

/**
 * Check if a Shopify product exists and get all its variants
 * @param {string} shopifyProductId - Shopify product ID
 * @returns {Promise<Object|null>} Product data with variants or null if not found
 */
async function checkShopifyProduct(shopifyProductId) {
  const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN } = getShopifyCredentials();
  const SHOPIFY_API_VERSION = '2025-10';
  
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    console.warn('[sync-stock] SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN not set');
    return null;
  }

  try {
    const productUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`;
    const response = await fetch(productUrl, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[sync-stock] Product ${shopifyProductId} not found in Shopify (deleted)`);
        return null;
      }
      console.error(`[sync-stock] Failed to fetch product ${shopifyProductId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const product = data.product;
    
    return {
      id: product.id?.toString(),
      title: product.title,
      variants: (product.variants || []).map(v => ({
        id: v.id?.toString(),
        inventory_item_id: v.inventory_item_id?.toString(),
        title: v.title,
      })),
    };
  } catch (error) {
    console.error(`[sync-stock] Error checking Shopify product ${shopifyProductId}:`, error);
    return null;
  }
}

/**
 * Sync stock for a variant when validation detects discrepancies
 * This function mimics the webhook behavior to keep stock in sync
 * If a variant is deleted, it checks all variants of the product
 * 
 * @param {string|number} shopifyVariantId - Shopify variant ID
 * @param {string} inventoryItemId - Optional inventory item ID (if already fetched during validation)
 * @returns {Promise<Object>} Result of sync operation
 */
export async function syncStockForVariant(shopifyVariantId, inventoryItemId = null) {
  console.log(`[sync-stock] 🔄 Syncing stock for variant ${shopifyVariantId}${inventoryItemId ? ` (with inventoryItemId: ${inventoryItemId})` : ' (will fetch inventoryItemId)'}...`);
  
  try {
    // Step 1: Get inventory item ID and product info (try multiple methods)
    let finalInventoryItemId = inventoryItemId;
    let productInfo = null;
    let shopifyProductId = null;
    
    // Always try to get product info from Firestore (needed to check if entire product is deleted)
    console.log(`[sync-stock] 🔍 Looking up product info from Firestore...`);
    const firestoreInfo = await getInventoryItemIdFromFirestore(shopifyVariantId);
    
    if (firestoreInfo) {
      if (typeof firestoreInfo === 'string') {
        // Legacy return format (just the ID string)
        if (!finalInventoryItemId) {
          finalInventoryItemId = firestoreInfo;
        }
      } else {
        // New return format (object with product info)
        if (!finalInventoryItemId) {
          finalInventoryItemId = firestoreInfo.inventoryItemId;
        }
        shopifyProductId = firestoreInfo.shopifyProductId;
        productInfo = firestoreInfo;
        if (firestoreInfo.allVariants) {
          console.log(`[sync-stock] ✅ Found product ${shopifyProductId} with ${firestoreInfo.allVariants.length} variant(s) in database`);
        }
      }
    }
    
    // If we still don't have inventoryItemId, try Shopify API
    if (!finalInventoryItemId) {
      console.log(`[sync-stock] 🔍 Fetching inventoryItemId from Shopify API...`);
      finalInventoryItemId = await getInventoryItemIdFromVariant(shopifyVariantId);
      
      // If we still don't have inventoryItemId, try to get product ID from shopifyItems
      // This handles the case where variant was already deleted from storefronts
      if (!finalInventoryItemId) {
        console.warn(`[sync-stock] ⚠️  Could not get inventory item ID for variant ${shopifyVariantId} from Shopify API or storefronts`);
        
        // Try to get product info from shopifyItems (authoritative source)
        // This might still have the variant even if it's deleted from storefronts
        if (!shopifyProductId) {
          const shopifyItemsInfo = await getProductInfoFromShopifyItems(shopifyVariantId);
          if (shopifyItemsInfo && shopifyItemsInfo.inventoryItemId) {
            // Found in shopifyItems - use this inventoryItemId
            finalInventoryItemId = shopifyItemsInfo.inventoryItemId;
            shopifyProductId = shopifyItemsInfo.shopifyProductId;
            productInfo = shopifyItemsInfo;
            console.log(`[sync-stock] ✅ Found variant in shopifyItems: productId=${shopifyProductId}, inventoryItemId=${finalInventoryItemId}`);
          } else if (shopifyItemsInfo && shopifyItemsInfo.shopifyProductId) {
            // Found product but variant already removed from shopifyItems
            // This means variant was already deleted - check if entire product was deleted
            shopifyProductId = shopifyItemsInfo.shopifyProductId;
            console.log(`[sync-stock] ℹ️  Variant not in shopifyItems, but product ${shopifyProductId} exists - checking if product was deleted from Shopify...`);
            
            const shopifyProduct = await checkShopifyProduct(shopifyProductId);
            if (!shopifyProduct) {
              // Entire product deleted
              console.log(`[sync-stock] 🗑️  Entire product ${shopifyProductId} deleted from Shopify`);
              const { deleteAllProductVariants } = await import('@/lib/delete-deleted-products');
              const deleteResult = await deleteAllProductVariants(shopifyProductId, []);
              
              if (deleteResult.success) {
                return {
                  success: true,
                  shopifyProductId,
                  totalAvailable: 0,
                  deleted: true,
                  deletedVariants: deleteResult.storefronts.deletedVariants,
                  deletedProducts: deleteResult.storefronts.deletedProducts,
                  note: 'Entire product deleted from Shopify - all variants removed from database',
                };
              }
            } else {
              // Product exists in Shopify - variant was just deleted (already handled)
              console.log(`[sync-stock] ℹ️  Variant ${shopifyVariantId} already deleted, product ${shopifyProductId} still exists with ${shopifyProduct.variants.length} variant(s)`);
              return {
                success: true,
                shopifyVariantId: shopifyVariantId.toString(),
                shopifyProductId,
                totalAvailable: 0,
                deleted: true,
                deletedVariants: 0,
                deletedProducts: 0,
                note: 'Variant already deleted from database',
              };
            }
          } else {
            // Variant completely gone from database - likely already deleted
            console.log(`[sync-stock] ℹ️  Variant ${shopifyVariantId} not found in database - likely already deleted`);
            return {
              success: true,
              shopifyVariantId: shopifyVariantId.toString(),
              totalAvailable: 0,
              deleted: true,
              deletedVariants: 0,
              deletedProducts: 0,
              note: 'Variant not found in database - likely already deleted',
            };
          }
        }
        
        // If we still don't have inventoryItemId after all attempts, we can't proceed
        if (!finalInventoryItemId) {
          return { success: false, error: 'Could not get inventory item ID or product ID from any source' };
        }
      }
    }
    
    if (finalInventoryItemId && !shopifyProductId) {
      console.log(`[sync-stock] ✅ Using inventoryItemId ${finalInventoryItemId}${inventoryItemId ? ' from validation' : ' from lookup'}`);
    }

    // Step 3: Fetch current inventory levels from Shopify
    const inventoryLevels = await fetchInventoryLevels(finalInventoryItemId);
    if (!inventoryLevels) {
      console.warn(`[sync-stock] ⚠️  Could not fetch inventory levels for inventory item ${finalInventoryItemId} - variant may have been deleted from Shopify`);
      
      // If variant is deleted, check the entire product
      if (shopifyProductId) {
        console.log(`[sync-stock] 🔍 Checking if entire product ${shopifyProductId} was deleted from Shopify...`);
        const shopifyProduct = await checkShopifyProduct(shopifyProductId);
        
        if (!shopifyProduct) {
          // Entire product deleted - delete all variants
          console.log(`[sync-stock] 🗑️  Entire product ${shopifyProductId} deleted from Shopify - will delete all variants`);
          
          if (productInfo && productInfo.allVariants && productInfo.allVariants.length > 0) {
            const { deleteAllProductVariants } = await import('@/lib/delete-deleted-products');
            const deleteResult = await deleteAllProductVariants(shopifyProductId, productInfo.allVariants);
            
            if (deleteResult.success) {
              return {
                success: true,
                inventoryItemId: finalInventoryItemId,
                shopifyProductId,
                totalAvailable: 0,
                deleted: true,
                deletedVariants: deleteResult.storefronts.deletedVariants,
                deletedProducts: deleteResult.storefronts.deletedProducts,
                updatedProducts: deleteResult.storefronts.updatedProducts || 0,
                note: 'Entire product deleted from Shopify - all variants removed from database',
              };
            } else {
              console.error(`[sync-stock] ❌ Failed to delete product variants:`, deleteResult.error);
              // Fall through to single variant deletion
            }
          } else {
            // We know the product is deleted but don't have variant list - try to find and delete by product ID
            console.log(`[sync-stock] ⚠️  Product ${shopifyProductId} deleted but variant list not available - will delete by product ID`);
            const { deleteAllProductVariants } = await import('@/lib/delete-deleted-products');
            // Pass empty array - the function will find all variants by product ID
            const deleteResult = await deleteAllProductVariants(shopifyProductId, []);
            
            if (deleteResult.success) {
              return {
                success: true,
                inventoryItemId: finalInventoryItemId,
                shopifyProductId,
                totalAvailable: 0,
                deleted: true,
                deletedVariants: deleteResult.storefronts.deletedVariants,
                deletedProducts: deleteResult.storefronts.deletedProducts,
                updatedProducts: deleteResult.storefronts.updatedProducts || 0,
                note: 'Entire product deleted from Shopify - all variants removed from database',
              };
            } else {
              console.error(`[sync-stock] ❌ Failed to delete product by ID:`, deleteResult.error);
              // Fall through to single variant deletion
            }
          }
        } else {
          // Product exists, but this variant might be deleted
          // Check if this variant ID exists in Shopify
          const variantExists = shopifyProduct.variants.some(v => v.id === shopifyVariantId.toString());
          
          if (!variantExists) {
            // Only this variant is deleted, not the entire product
            console.log(`[sync-stock] 🗑️  Variant ${shopifyVariantId} deleted from Shopify (product ${shopifyProductId} still exists with ${shopifyProduct.variants.length} variant(s))`);
            
            try {
              const { deleteDeletedProduct } = await import('@/lib/delete-deleted-products');
              const deleteResult = await deleteDeletedProduct(shopifyVariantId, finalInventoryItemId);
              
              if (deleteResult.success) {
                return {
                  success: true,
                  inventoryItemId: finalInventoryItemId,
                  shopifyProductId,
                  totalAvailable: 0,
                  deleted: true,
                  deletedVariants: deleteResult.storefronts.deletedVariants,
                  deletedProducts: deleteResult.storefronts.deletedProducts,
                  updatedProducts: deleteResult.storefronts.updatedProducts,
                  note: 'Variant deleted from Shopify - removed from database',
                };
              } else {
                console.error(`[sync-stock] ❌ Failed to delete variant from database:`, deleteResult.error);
                return { success: false, error: `Failed to delete variant: ${deleteResult.error}` };
              }
            } catch (deleteError) {
              console.error(`[sync-stock] ❌ Error during variant deletion:`, deleteError);
              return { success: false, error: `Deletion error: ${deleteError.message}` };
            }
          }
        }
      }
      
      // Fallback: If we couldn't check the product, just delete the variant
      console.log(`[sync-stock] 🗑️  Variant appears to be deleted from Shopify - deleting from database`);
      
      try {
        const { deleteDeletedProduct } = await import('@/lib/delete-deleted-products');
        const deleteResult = await deleteDeletedProduct(shopifyVariantId, finalInventoryItemId);
        
        if (deleteResult.success) {
          return {
            success: true,
            inventoryItemId: finalInventoryItemId,
            totalAvailable: 0,
            deleted: true,
            deletedVariants: deleteResult.storefronts.deletedVariants,
            deletedProducts: deleteResult.storefronts.deletedProducts,
            updatedProducts: deleteResult.storefronts.updatedProducts,
            note: 'Variant deleted from Shopify - removed from database',
          };
        } else {
          console.error(`[sync-stock] ❌ Failed to delete variant from database:`, deleteResult.error);
          return { success: false, error: `Failed to delete variant: ${deleteResult.error}` };
        }
      } catch (deleteError) {
        console.error(`[sync-stock] ❌ Error during variant deletion:`, deleteError);
        return { success: false, error: `Deletion error: ${deleteError.message}` };
      }
    }

    console.log(`[sync-stock] 📦 Fetched inventory: ${inventoryLevels.totalAvailable} available for inventory item ${finalInventoryItemId}`);

    // Step 3: Update database (same as webhook does)
    const db = getAdminDb();
    if (!db) {
      console.error('[sync-stock] ❌ Admin DB not available');
      return { success: false, error: 'Admin DB not available' };
    }

    // Update shopifyItems first (authoritative source)
    const updatedProducts = await updateShopifyItemsVariants(db, finalInventoryItemId, inventoryLevels);
    console.log(`[sync-stock] ✅ Updated ${updatedProducts.length} product(s) in shopifyItems collection`);

    // Then update storefront products
    const storefrontResult = await updateStorefrontVariants(db, finalInventoryItemId, inventoryLevels, updatedProducts);
    console.log(`[sync-stock] ✅ Updated ${storefrontResult.variantCount} variant(s) and ${storefrontResult.productCount} product(s) in storefronts`);

    return {
      success: true,
      inventoryItemId: finalInventoryItemId,
      totalAvailable: inventoryLevels.totalAvailable,
      updatedProducts: updatedProducts.length,
      updatedVariants: storefrontResult.variantCount,
      updatedStorefrontProducts: storefrontResult.productCount,
    };
  } catch (error) {
    console.error(`[sync-stock] ❌ Error syncing stock for variant ${shopifyVariantId}:`, error);
    return { success: false, error: error.message };
  }
}

