/**
 * Stock Utility Functions
 * 
 * ARCHITECTURE NOTE: Single Source of Truth for Stock
 * ====================================================
 * 
 * Stock data follows a hybrid approach:
 * 
 * 1. AUTHORITATIVE SOURCE: shopifyItems collection
 *    - Updated FIRST by Shopify webhooks (inventory-item-update)
 *    - Contains raw Shopify product data with variant inventory
 *    - One document per Shopify product (storefront-agnostic)
 * 
 * 2. DENORMALIZED COPIES: {storefront}/products/items/{productId}
 *    - Updated AFTER shopifyItems by webhooks
 *    - Contains processed product data for fast queries
 *    - Stock is denormalized here for filtering/querying performance
 * 
 * 3. WEBHOOK FLOW:
 *    Shopify webhook → updateShopifyItemsVariants() → updateStorefrontVariants()
 *    This ensures shopifyItems is always updated first, then propagated to storefronts.
 * 
 * 4. QUERYING:
 *    - Storefront queries use denormalized stock for fast filtering
 *    - Admin verification can use getStockFromShopifyItems() to check authoritative source
 * 
 * 5. CONSISTENCY:
 *    - Stock should be identical across all storefronts for the same product
 *    - If inconsistencies are found, run: npm run stock:sync-from-shopify
 */

import { getFirebaseDb } from './firebase';
import { getCollectionPath, getDocumentPath } from './store-collections';
import { collection, doc, getDoc, query, where, getDocs } from 'firebase/firestore';

/**
 * Calculate product-level stock status from variants
 * @param {Array} variants - Array of variant objects
 * @returns {Object} Stock status with totalStock, hasInStockVariants, etc.
 */
export function calculateProductStockFromVariants(variants) {
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
    // Support multiple field names for stock
    const stock = variant.stock || 
                  variant.inventory_quantity || 
                  variant.inventoryQuantity || 
                  variant.inventory_quantity_total || 
                  0;
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
 * Get authoritative stock data from shopifyItems collection
 * This is the single source of truth for stock information.
 * 
 * @param {string} shopifyItemDocId - Document ID in shopifyItems collection
 * @returns {Promise<Object|null>} Stock status or null if not found
 */
export async function getStockFromShopifyItems(shopifyItemDocId) {
  const db = getFirebaseDb();
  if (!db || !shopifyItemDocId) {
    return null;
  }

  try {
    const shopifyItemRef = doc(db, ...getCollectionPath('shopifyItems'), shopifyItemDocId);
    const shopifyItemDoc = await getDoc(shopifyItemRef);
    
    if (!shopifyItemDoc.exists()) {
      return null;
    }

    const shopifyItemData = shopifyItemDoc.data();
    const rawProduct = shopifyItemData.rawProduct;
    
    if (!rawProduct || !rawProduct.variants) {
      return {
        totalStock: 0,
        hasInStockVariants: false,
        inStockVariantCount: 0,
        totalVariantCount: 0,
      };
    }

    // Calculate from rawProduct.variants
    return calculateProductStockFromVariants(rawProduct.variants);
  } catch (error) {
    console.error('[stock-utils] Error fetching stock from shopifyItems:', error);
    return null;
  }
}

/**
 * Get stock from shopifyItems by sourceShopifyId
 * Useful when you only have the Shopify product ID, not the Firestore doc ID
 * 
 * @param {string} sourceShopifyId - Shopify product ID
 * @returns {Promise<Object|null>} Stock status or null if not found
 */
export async function getStockFromShopifyItemsByShopifyId(sourceShopifyId) {
  const db = getFirebaseDb();
  if (!db || !sourceShopifyId) {
    return null;
  }

  try {
    const shopifyItemsRef = collection(db, ...getCollectionPath('shopifyItems'));
    const q = query(shopifyItemsRef, where('shopifyId', '==', sourceShopifyId.toString()), where('rawProduct', '!=', null));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    const shopifyItemDoc = snapshot.docs[0];
    const shopifyItemData = shopifyItemDoc.data();
    const rawProduct = shopifyItemData.rawProduct;
    
    if (!rawProduct || !rawProduct.variants) {
      return {
        totalStock: 0,
        hasInStockVariants: false,
        inStockVariantCount: 0,
        totalVariantCount: 0,
      };
    }

    // Calculate from rawProduct.variants
    return calculateProductStockFromVariants(rawProduct.variants);
  } catch (error) {
    console.error('[stock-utils] Error fetching stock from shopifyItems by shopifyId:', error);
    return null;
  }
}

