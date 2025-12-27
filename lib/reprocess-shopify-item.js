/**
 * Reprocess Shopify Items
 * 
 * Utilities for reprocessing items that were processed with older logic
 * This deletes products from storefronts and resets shopifyItems to initial state
 */

import { getAdminDb } from '@/lib/firestore-server';
import { FieldValue } from 'firebase-admin/firestore';
import { deleteAllProductVariants, removeProductFromCategories } from './delete-deleted-products';

/**
 * Get all storefronts where a product exists
 * @param {Object} db - Firestore Admin instance
 * @param {string} shopifyProductId - Shopify product ID
 * @returns {Promise<Array>} Array of storefront names
 */
async function getStorefrontsWithProduct(db, shopifyProductId) {
  const storefronts = [];
  
  try {
    // Use the same method as /api/storefronts route: check for Info document
    const collections = await db.listCollections();
    const excludedCollections = ['shopifyItems', 'carts', 'orders', 'users', 'userEvents', 'shippingRates'];
    
    for (const coll of collections) {
      const id = coll.id;
      
      // Skip excluded collections
      if (excludedCollections.includes(id)) {
        continue;
      }
      
      // Check if this collection has an Info document - if it exists, it's a storefront
      let isStorefront = false;
      try {
        const infoRef = coll.doc('Info');
        const infoSnap = await infoRef.get();
        if (infoSnap.exists) {
          isStorefront = true;
        } else if (id === 'LUNERA') {
          // Always include LUNERA as default storefront even if Info doesn't exist
          isStorefront = true;
        }
      } catch (infoError) {
        // Info document doesn't exist or can't be accessed - not a storefront (unless it's LUNERA)
        if (id === 'LUNERA') {
          isStorefront = true;
        }
      }
      
      if (isStorefront) {
        // Check if product exists in this storefront
        try {
          const productsCollection = db.collection(id).doc('products').collection('items');
          const productsSnapshot = await productsCollection
            .where('sourceShopifyId', '==', shopifyProductId.toString())
            .limit(1)
            .get();
          
          if (!productsSnapshot.empty) {
            storefronts.push(id);
          }
        } catch (e) {
          // Error checking products, skip this storefront
        }
      }
    }
  } catch (error) {
    console.error('[reprocess] Error getting storefronts:', error);
  }
  
  return storefronts;
}

/**
 * Get all categories that will be affected by product deletion
 * @param {Object} db - Firestore Admin instance
 * @param {Array<string>} storefronts - Storefront names to check
 * @param {string} shopifyProductId - Shopify product ID
 * @returns {Promise<Array>} Array of { storefront, categoryId, categoryName } objects
 */
async function getAffectedCategories(db, storefronts, shopifyProductId) {
  const affectedCategories = [];
  
      for (const storefront of storefronts) {
        try {
          const productsCollection = db.collection(storefront).doc('products').collection('items');
          const shopifyProductIdStr = String(shopifyProductId).trim();
          const shopifyProductIdNum = parseInt(shopifyProductIdStr, 10);
          
          let productsSnapshot = await productsCollection
            .where('sourceShopifyId', '==', shopifyProductIdStr)
            .get();
          
          if (productsSnapshot.empty && !isNaN(shopifyProductIdNum)) {
            productsSnapshot = await productsCollection
              .where('sourceShopifyId', '==', shopifyProductIdNum)
              .get();
          }
      
      for (const productDoc of productsSnapshot.docs) {
        const productData = productDoc.data();
        const categoryIds = productData.categoryIds || (productData.categoryId ? [productData.categoryId] : []);
        
        const categoriesCollection = db.collection(storefront).doc('categories').collection('items');
        
        for (const categoryId of categoryIds) {
          try {
            const categoryDoc = await categoriesCollection.doc(categoryId).get();
            if (categoryDoc.exists) {
              const categoryData = categoryDoc.data();
              affectedCategories.push({
                storefront,
                categoryId,
                categoryName: categoryData.name || categoryId,
                productId: productDoc.id,
              });
            }
          } catch (e) {
            // Category doesn't exist, skip
          }
        }
      }
    } catch (error) {
      console.error(`[reprocess] Error getting categories for ${storefront}:`, error);
    }
  }
  
  return affectedCategories;
}

/**
 * Get information about what will be affected by reprocessing
 * @param {string} shopifyItemDocId - shopifyItems document ID
 * @returns {Promise<Object>} Summary of what will be affected
 */
export async function getReprocessPreview(shopifyItemDocId) {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Admin DB not available');
  }
  
  try {
    // Get shopifyItem document
    const shopifyItemDoc = await db.collection('shopifyItems').doc(shopifyItemDocId).get();
    if (!shopifyItemDoc.exists) {
      throw new Error(`Shopify item ${shopifyItemDocId} not found`);
    }
    
    const shopifyItemData = shopifyItemDoc.data();
    const shopifyProductId = shopifyItemData.shopifyId;
    
    if (!shopifyProductId) {
      throw new Error('Shopify item has no shopifyId');
    }
    
    // Normalize the ID for consistent comparisons
    const shopifyProductIdStr = String(shopifyProductId).trim();
    
    // Get storefronts where product exists
    const storefronts = await getStorefrontsWithProduct(db, shopifyProductIdStr);
    
    // Get affected categories
    const affectedCategories = await getAffectedCategories(db, storefronts, shopifyProductIdStr);
    
    return {
      shopifyItemId: shopifyItemDocId,
      shopifyProductId: shopifyProductIdStr,
      productName: shopifyItemData.title || shopifyItemData.name || 'Unknown Product',
      storefronts,
      affectedCategories,
      processedStorefronts: shopifyItemData.processedStorefronts || [],
    };
  } catch (error) {
    console.error('[reprocess] Error getting reprocess preview:', error);
    throw error;
  }
}

/**
 * Delete product from all storefronts (but keep shopifyItems document)
 * @param {string} shopifyProductId - Shopify product ID
 * @param {string} shopifyItemDocId - shopifyItems document ID (for alternative lookup)
 * @returns {Promise<Object>} Deletion result
 */
async function deleteProductFromAllStorefronts(shopifyProductId, shopifyItemDocId) {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Admin DB not available');
  }
  
  // Normalize shopifyProductId - handle both string and number types
  // Products store sourceShopifyId as numbers, so we need to handle both
  let shopifyProductIdStr = String(shopifyProductId).trim();
  let shopifyProductIdNum = null;
  
  // Only parse as number if it's a valid integer and within safe range
  const parsedNum = parseInt(shopifyProductIdStr, 10);
  if (!isNaN(parsedNum) && parsedNum.toString() === shopifyProductIdStr && parsedNum < Number.MAX_SAFE_INTEGER) {
    shopifyProductIdNum = parsedNum;
  }
  
  console.log(`[reprocess] 🗑️  Deleting product ${shopifyProductIdStr}${shopifyProductIdNum ? ` (as number: ${shopifyProductIdNum})` : ''} from all storefronts...`);
  
  const deletedVariants = [];
  const deletedProducts = [];
  
  try {
    // Get all storefronts using the same method as /api/storefronts route
    // Check for Info document to identify storefronts (more reliable than checking for products)
    const collections = await db.listCollections();
    const storefronts = [];
    const excludedCollections = ['shopifyItems', 'carts', 'orders', 'users', 'userEvents', 'shippingRates'];
    
    for (const coll of collections) {
      const id = coll.id;
      
      // Skip excluded collections
      if (excludedCollections.includes(id)) {
        continue;
      }
      
      // Check if this collection has an Info document - if it exists, it's a storefront
      try {
        const infoRef = coll.doc('Info');
        const infoSnap = await infoRef.get();
        if (infoSnap.exists) {
          storefronts.push(id);
        } else if (id === 'LUNERA') {
          // Always include LUNERA as default storefront even if Info doesn't exist
          storefronts.push(id);
        }
      } catch (infoError) {
        // Info document doesn't exist or can't be accessed - not a storefront (unless it's LUNERA)
        if (id === 'LUNERA') {
          storefronts.push(id);
        }
      }
    }

    // Ensure at least LUNERA is included
    if (storefronts.length === 0) {
      storefronts.push('LUNERA');
    }

    // Sort alphabetically
    storefronts.sort();

    console.log(`[reprocess] Found ${storefronts.length} storefronts to check:`, storefronts);

    // Delete all variants and products from storefronts
    const categoryCleanupResults = [];
    for (const storefront of storefronts) {
      try {
        console.log(`[reprocess] Checking storefront: ${storefront}`);
        const productsCollection = db.collection(storefront).doc('products').collection('items');
        
        // Find products by sourceShopifyId - try both number and string since Firestore stores as numbers
        // Products typically store sourceShopifyId as numbers, so try number first
        let productsSnapshot = null;
        
        if (shopifyProductIdNum !== null) {
          // Try as number first (most common case)
          productsSnapshot = await productsCollection
            .where('sourceShopifyId', '==', shopifyProductIdNum)
            .get();
        }
        
        if ((!productsSnapshot || productsSnapshot.empty) && shopifyProductIdStr) {
          // Try as string if number didn't work
          productsSnapshot = await productsCollection
            .where('sourceShopifyId', '==', shopifyProductIdStr)
            .get();
        }
        
        // Fallback: try by sourceShopifyItemDocId if available
        if ((!productsSnapshot || productsSnapshot.empty) && shopifyItemDocId) {
          productsSnapshot = await productsCollection
            .where('sourceShopifyItemDocId', '==', shopifyItemDocId)
            .get();
        }
        
        // If still empty, do a full scan as last resort (handles edge cases)
        if (!productsSnapshot || productsSnapshot.empty) {
          const allProductsSnapshot = await productsCollection.get();
          const matchingDocs = [];
          for (const doc of allProductsSnapshot.docs) {
            const data = doc.data();
            const dataShopifyId = data.sourceShopifyId;
            const dataShopifyIdStr = dataShopifyId?.toString()?.trim();
            const dataShopifyIdNum = typeof dataShopifyId === 'number' ? dataShopifyId : (dataShopifyIdStr ? parseInt(dataShopifyIdStr, 10) : null);
            
            // Match by ID (string or number)
            if ((shopifyProductIdNum !== null && dataShopifyIdNum === shopifyProductIdNum) ||
                (shopifyProductIdStr && dataShopifyIdStr === shopifyProductIdStr) ||
                (shopifyItemDocId && data.sourceShopifyItemDocId === shopifyItemDocId)) {
              matchingDocs.push(doc);
            }
          }
          
          // Create a fake snapshot-like object with matching docs
          if (matchingDocs.length > 0) {
            productsSnapshot = { docs: matchingDocs, empty: false };
            console.log(`[reprocess] Found ${matchingDocs.length} product(s) in ${storefront} via full scan`);
          } else {
            productsSnapshot = { docs: [], empty: true };
          }
        }
        
        if (productsSnapshot && !productsSnapshot.empty) {
          console.log(`[reprocess] Found ${productsSnapshot.docs.length} product(s) in ${storefront}`);
        }
        
        for (const productDoc of productsSnapshot.docs) {
          const productData = productDoc.data();
          const productCategoryIds = productData.categoryIds || (productData.categoryId ? [productData.categoryId] : []);
          const variantsCollection = productDoc.ref.collection('variants');
          const variantsSnapshot = await variantsCollection.get();
          
          console.log(`[reprocess] Product ${productDoc.id} has ${variantsSnapshot.docs.length} variant(s) to delete`);
          
          // Delete all variants
          for (const variantDoc of variantsSnapshot.docs) {
            await variantDoc.ref.delete();
            deletedVariants.push({
              storefront,
              productId: productDoc.id,
              variantId: variantDoc.id,
            });
            console.log(`[reprocess] 🗑️  Deleted variant ${variantDoc.id} from product ${productDoc.id} in ${storefront}`);
          }
          
          // Delete the product itself
          await productDoc.ref.delete();
          deletedProducts.push({
            storefront,
            productId: productDoc.id,
            categoryIds: productCategoryIds,
          });
          
          console.log(`[reprocess] 🗑️  Deleted product ${productDoc.id} (with ${variantsSnapshot.docs.length} variants) from ${storefront}`);
          
          // Clean up categories
          if (productCategoryIds && productCategoryIds.length > 0) {
            const cleanupResult = await removeProductFromCategories(
              db,
              storefront,
              productDoc.id,
              productCategoryIds
            );
            categoryCleanupResults.push({
              storefront,
              productId: productDoc.id,
              ...cleanupResult,
            });
            console.log(`[reprocess] 🧹 Cleaned up ${productCategoryIds.length} category/categories for product ${productDoc.id}`);
          }
        }
      } catch (error) {
        console.error(`[reprocess] ❌ Error processing storefront ${storefront}:`, error);
        // Continue with other storefronts
      }
    }
    
    const totalDeletedCategories = categoryCleanupResults.reduce((sum, r) => sum + (r.details?.deletedCategories?.length || 0), 0);
    const totalUpdatedCategories = categoryCleanupResults.reduce((sum, r) => sum + (r.details?.updatedCategories?.length || 0), 0);
    
    console.log(`[reprocess] ✅ Deleted product ${shopifyProductIdStr} from all storefronts`);
    console.log(`[reprocess]    - Storefronts: ${deletedVariants.length} variants deleted, ${deletedProducts.length} products deleted`);
    console.log(`[reprocess]    - Categories: ${totalUpdatedCategories} updated, ${totalDeletedCategories} deleted`);
    
    if (deletedProducts.length === 0) {
      console.warn(`[reprocess] ⚠️  No products were deleted! This might mean the product doesn't exist in any storefront with sourceShopifyId=${shopifyProductId}`);
    }
    
    return {
      success: true,
      storefronts: {
        deletedVariants: deletedVariants.length,
        deletedProducts: deletedProducts.length,
        details: {
          deletedVariants,
          deletedProducts,
        },
      },
      categories: {
        deletedCategories: totalDeletedCategories,
        updatedCategories: totalUpdatedCategories,
        details: categoryCleanupResults,
      },
    };
  } catch (error) {
    console.error(`[reprocess] ❌ Error deleting product ${shopifyProductId}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Reset shopifyItems document to initial state (as if just created by webhook)
 * @param {string} shopifyItemDocId - shopifyItems document ID
 * @returns {Promise<void>}
 */
async function resetShopifyItem(shopifyItemDocId) {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Admin DB not available');
  }
  
    console.log(`[reprocess] 🔄 Clearing processed storefronts from shopifyItem ${shopifyItemDocId}...`);
  
  try {
    const shopifyItemRef = db.collection('shopifyItems').doc(shopifyItemDocId);
    const shopifyItemDoc = await shopifyItemRef.get();
    
    if (!shopifyItemDoc.exists) {
      throw new Error(`Shopify item ${shopifyItemDocId} not found`);
    }
    
    const currentData = shopifyItemDoc.data();
    
    // Reset to initial state (like webhook created it)
    // Keep essential data: shopifyId, title, rawProduct, etc.
    // Clear processing-related fields
    await shopifyItemRef.update({
      storefronts: [], // Clear storefronts array (will be repopulated during reprocessing)
      processedStorefronts: [], // Clear processed storefronts
      hasProcessedStorefronts: false, // Reset flag
      matchedCategorySlug: null, // Clear matched category
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    console.log(`[reprocess] ✅ Cleared processed storefronts from shopifyItem ${shopifyItemDocId}`);
  } catch (error) {
    console.error(`[reprocess] ❌ Error resetting shopifyItem ${shopifyItemDocId}:`, error);
    throw error;
  }
}

/**
 * Reprocess a Shopify item - delete from storefronts and reset to initial state
 * @param {string} shopifyItemDocId - shopifyItems document ID
 * @returns {Promise<Object>} Reprocess result
 */
export async function reprocessShopifyItem(shopifyItemDocId) {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Admin DB not available');
  }
  
  console.log(`[reprocess] 🔄 Starting reprocess for shopifyItem ${shopifyItemDocId}...`);
  
  try {
    // Get shopifyItem to find shopifyProductId
    const shopifyItemDoc = await db.collection('shopifyItems').doc(shopifyItemDocId).get();
    if (!shopifyItemDoc.exists) {
      throw new Error(`Shopify item ${shopifyItemDocId} not found`);
    }
    
    const shopifyItemData = shopifyItemDoc.data();
    const shopifyProductId = shopifyItemData.shopifyId;
    
    if (!shopifyProductId) {
      throw new Error('Shopify item has no shopifyId');
    }
    
    // Normalize the ID for consistent comparisons
    const shopifyProductIdStr = String(shopifyProductId).trim();
    
    // Step 1: Delete product from all storefronts
    const deletionResult = await deleteProductFromAllStorefronts(shopifyProductIdStr, shopifyItemDocId);
    
    // Verify deletion was successful
    if (!deletionResult.success) {
      throw new Error(`Failed to delete product from storefronts: ${deletionResult.error || 'Unknown error'}`);
    }
    
    console.log(`[reprocess] ✅ Deletion complete: ${deletionResult.storefronts.deletedVariants} variants, ${deletionResult.storefronts.deletedProducts} products deleted`);
    
    // Step 2: Reset shopifyItems document
    await resetShopifyItem(shopifyItemDocId);
    
    console.log(`[reprocess] ✅ Successfully reprocessed shopifyItem ${shopifyItemDocId}`);
    
    return {
      success: true,
      shopifyItemId: shopifyItemDocId,
      shopifyProductId: shopifyProductIdStr,
      deletionResult,
    };
  } catch (error) {
    console.error(`[reprocess] ❌ Error reprocessing shopifyItem ${shopifyItemDocId}:`, error);
    throw error;
  }
}

