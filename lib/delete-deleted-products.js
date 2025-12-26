/**
 * Delete products/variants that have been removed from Shopify
 * 
 * When a variant is deleted from Shopify, we should remove it from our database
 * If all variants of a product are deleted, remove the product as well
 */

import { getAdminDb } from '@/lib/firestore-server';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Determine a new default variant from remaining variants
 * Logic matches useProductSaver: use first variant
 * @param {Array} variants - Array of variant objects with { id, ...data }
 * @returns {Object|null} - New default variant or null
 */
function determineNewDefaultVariant(variants) {
  if (!variants || variants.length === 0) {
    return null;
  }
  
  // Use first variant as default (matches useProductSaver logic)
  return variants[0];
}

/**
 * Get the main image from a variant (matches useProductSaver logic)
 * Checks multiple sources: defaultPhoto, images array, etc.
 * @param {Object} variant - Variant object
 * @returns {string|null} - Image URL or null
 */
function getVariantMainImage(variant) {
  if (!variant) return null;
  
  // Method 1: Check explicit defaultPhoto field
  if (variant.defaultPhoto) {
    return variant.defaultPhoto;
  }
  
  // Method 2: Check images array
  if (variant.images && Array.isArray(variant.images) && variant.images.length > 0) {
    return variant.images[0];
  }
  
  // Method 3: Check imageUrl field
  if (variant.imageUrl) {
    return variant.imageUrl;
  }
  
  // Method 4: Check image field
  if (variant.image) {
    return typeof variant.image === 'string' ? variant.image : variant.image.url;
  }
  
  return null;
}

/**
 * Get price from a variant
 * @param {Object} variant - Variant object
 * @returns {number|null} - Price or null
 */
function getVariantPrice(variant) {
  if (!variant) return null;
  
  // Try multiple price fields
  if (variant.price != null) {
    return parseFloat(variant.price);
  }
  
  if (variant.priceAtAdd != null) {
    return parseFloat(variant.priceAtAdd);
  }
  
  return null;
}

/**
 * Delete a variant from all storefronts where it exists
 * @param {string} shopifyVariantId - Shopify variant ID
 * @param {string} inventoryItemId - Inventory item ID (for matching)
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteVariantFromStorefronts(shopifyVariantId, inventoryItemId) {
  const db = getAdminDb();
  if (!db) {
    console.error('[delete-product] ❌ Admin DB not available');
    return { success: false, error: 'Admin DB not available' };
  }

  const deletedVariants = [];
  const updatedProducts = [];
  const deletedProducts = [];

  try {
    // Get all storefronts
    const collections = await db.listCollections();
    const storefronts = [];
    
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

    // Search for and delete the variant in each storefront
    for (const storefront of storefronts) {
      try {
        const productsCollection = db.collection(storefront).doc('products').collection('items');
        const productsSnapshot = await productsCollection.get();

        for (const productDoc of productsSnapshot.docs) {
          const productData = productDoc.data();
          
          if (!productData.sourceShopifyId) {
            continue;
          }

          const variantsCollection = productDoc.ref.collection('variants');
          
          // Try to find variant by shopifyVariantId first
          let variantDocs = await variantsCollection.where('shopifyVariantId', '==', shopifyVariantId.toString()).get();
          
          // If not found, try by shopifyInventoryItemId
          if (variantDocs.empty && inventoryItemId) {
            variantDocs = await variantsCollection.where('shopifyInventoryItemId', '==', inventoryItemId.toString()).get();
          }

          if (!variantDocs.empty) {
            const variantDoc = variantDocs.docs[0];
            
            // Delete the variant
            await variantDoc.ref.delete();
            deletedVariants.push({
              storefront,
              productId: productDoc.id,
              variantId: variantDoc.id,
            });
            console.log(`[delete-product] 🗑️  Deleted variant ${variantDoc.id} from ${storefront}/products/items/${productDoc.id}/variants`);

            // Get remaining variants after deletion
            const remainingVariants = await variantsCollection.get();
            
            // Check if this was the last variant - if so, delete the product too
            if (remainingVariants.empty) {
              // Get product's categoryIds before deleting
              const productCategoryIds = productData.categoryIds || (productData.categoryId ? [productData.categoryId] : []);
              
              // Delete the product (no variants left)
              await productDoc.ref.delete();
              deletedProducts.push({
                storefront,
                productId: productDoc.id,
                categoryIds: productCategoryIds,
              });
              console.log(`[delete-product] 🗑️  Deleted product ${productDoc.id} from ${storefront} (no variants remaining)`);
            } else {
              // Recalculate product-level stock after variant deletion
              const allVariants = remainingVariants.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              
              let totalStock = 0;
              let inStockVariantCount = 0;
              
              allVariants.forEach((variant) => {
                const stock = variant.stock || variant.inventory_quantity || variant.inventoryQuantity || 0;
                totalStock += stock;
                
                const hasStock = stock > 0;
                const allowsBackorder = variant.inventory_policy === 'continue';
                if (hasStock || allowsBackorder) {
                  inStockVariantCount++;
                }
              });

              const hasInStockVariants = inStockVariantCount > 0;
              
              // Check if deleted variant was the default variant
              // defaultVariantId can be either Firestore variant ID or Shopify variant ID
              const deletedVariantData = variantDoc.data();
              const deletedVariantId = variantDoc.id;
              const deletedShopifyVariantId = deletedVariantData.shopifyVariantId?.toString();
              const productDefaultVariantId = productData.defaultVariantId?.toString();
              
              const wasDefaultVariant = productDefaultVariantId && (
                productDefaultVariantId === deletedVariantId ||
                (deletedShopifyVariantId && productDefaultVariantId === deletedShopifyVariantId)
              );
              
              // Calculate minimum price from remaining variants (for basePrice)
              const allVariantPrices = allVariants
                .map(v => {
                  const price = v.price != null ? parseFloat(v.price) : null;
                  return price != null && price > 0 ? price : null;
                })
                .filter(p => p != null);
              
              const minPrice = allVariantPrices.length > 0 ? Math.min(...allVariantPrices) : null;
              
              // Prepare update data
              const updateData = {
                totalStock,
                hasInStockVariants,
                inStockVariantCount,
                totalVariantCount: allVariants.length,
                updatedAt: FieldValue.serverTimestamp(),
              };
              
              // Update basePrice if we have a valid minimum price
              if (minPrice != null) {
                updateData.basePrice = minPrice;
              }
              
              // If deleted variant was the default, set a new default variant
              if (wasDefaultVariant) {
                const newDefaultVariant = determineNewDefaultVariant(allVariants);
                
                if (newDefaultVariant) {
                  // Store as Firestore variant ID (matches useProductSaver logic)
                  updateData.defaultVariantId = newDefaultVariant.id;
                  
                  // Get main image from new default variant
                  const newMainImage = getVariantMainImage(newDefaultVariant);
                  if (newMainImage) {
                    updateData.mainImage = newMainImage;
                    
                    // Also update images array - remove deleted variant's image, add new default's image
                    const currentImages = Array.isArray(productData.images) ? productData.images : [];
                    // Remove old main image if it exists, add new one at the front
                    const filteredImages = currentImages.filter(img => {
                      const imageUrl = typeof img === 'string' ? img : img.url;
                      return imageUrl !== productData.mainImage;
                    });
                    updateData.images = [newMainImage, ...filteredImages].slice(0, 10); // Keep max 10 images
                  }
                  
                  // Get price from new default variant
                  const newDefaultPrice = getVariantPrice(newDefaultVariant);
                  if (newDefaultPrice != null) {
                    updateData.defaultVariantPrice = newDefaultPrice;
                  }
                  
                  console.log(`[delete-product] 🔄 Deleted variant was default - setting new default variant: ${newDefaultVariant.id}`);
                  console.log(`[delete-product]    - New default image: ${newMainImage || 'none'}`);
                  console.log(`[delete-product]    - New default price: ${newDefaultPrice || 'none'}`);
                } else {
                  // No variants left (shouldn't happen, but handle gracefully)
                  updateData.defaultVariantId = null;
                  updateData.mainImage = null;
                  updateData.defaultVariantPrice = null;
                  console.log(`[delete-product] ⚠️  Deleted variant was default but no variants remain`);
                }
              }
              
              await productDoc.ref.update(updateData);
              
              updatedProducts.push({
                storefront,
                productId: productDoc.id,
                wasDefaultVariant,
                newDefaultVariantId: updateData.defaultVariantId || null,
              });
              console.log(`[delete-product] ✅ Updated product ${productDoc.id} in ${storefront} after variant deletion:`);
              console.log(`[delete-product]    - totalStock: ${totalStock}, hasInStockVariants: ${hasInStockVariants}, inStockVariantCount: ${inStockVariantCount}, totalVariantCount: ${allVariants.length}`);
              console.log(`[delete-product]    - This product ${hasInStockVariants && totalStock >= 5 ? 'WILL' : 'WILL NOT'} appear on the storefront`);
            }
          }
        }
      } catch (error) {
        console.error(`[delete-product] ❌ Error processing storefront ${storefront}:`, error);
      }
    }

    return {
      success: true,
      deletedVariants: deletedVariants.length,
      updatedProducts: updatedProducts.length,
      deletedProducts: deletedProducts.length,
      details: {
        deletedVariants,
        updatedProducts,
        deletedProducts,
      },
    };
  } catch (error) {
    console.error('[delete-product] ❌ Error deleting variant from storefronts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete or update product in shopifyItems collection
 * If the product has other variants, update it; otherwise mark it as deleted
 * @param {string} inventoryItemId - Inventory item ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteVariantFromShopifyItems(inventoryItemId) {
  const db = getAdminDb();
  if (!db) {
    return { success: false, error: 'Admin DB not available' };
  }

  try {
    const shopifyCollection = db.collection('shopifyItems');
    const shopifyItemsSnapshot = await shopifyCollection.get();
    
    const updatedProducts = [];
    const deletedProducts = [];

    for (const shopifyDoc of shopifyItemsSnapshot.docs) {
      const shopifyData = shopifyDoc.data();
      const rawProduct = shopifyData.rawProduct;

      if (rawProduct && rawProduct.variants) {
        const variantIndex = rawProduct.variants.findIndex(
          variant => variant.inventory_item_id?.toString() === inventoryItemId.toString()
        );

        if (variantIndex >= 0) {
          const updatedVariants = rawProduct.variants.filter(
            (_, index) => index !== variantIndex
          );

          // If no variants remaining, we could delete the product or mark it
          // For now, let's keep it but mark variants as empty (product might be re-added)
          if (updatedVariants.length === 0) {
            // Update product to reflect no variants
            await shopifyDoc.ref.update({
              'rawProduct.variants': [],
              hasInStockVariants: false,
              inStockVariantCount: 0,
              totalVariantCount: 0,
              updatedAt: FieldValue.serverTimestamp(),
            });
            
            deletedProducts.push({
              shopifyId: shopifyData.shopifyId || rawProduct.id,
            });
            console.log(`[delete-product] 🗑️  Removed last variant from shopifyItems product ${shopifyDoc.id}`);
          } else {
            // Recalculate product-level stock status
            let hasInStockVariants = false;
            let inStockVariantCount = 0;
            
            updatedVariants.forEach(variant => {
              const hasStock = (variant.inventory_quantity || 0) > 0;
              const allowsBackorder = variant.inventory_policy === 'continue';
              if (hasStock || allowsBackorder) {
                hasInStockVariants = true;
                inStockVariantCount++;
              }
            });

            await shopifyDoc.ref.update({
              'rawProduct.variants': updatedVariants,
              hasInStockVariants,
              inStockVariantCount,
              totalVariantCount: updatedVariants.length,
              updatedAt: FieldValue.serverTimestamp(),
            });
            
            updatedProducts.push({
              shopifyId: shopifyData.shopifyId || rawProduct.id,
            });
            console.log(`[delete-product] ✅ Updated shopifyItems product ${shopifyDoc.id} after variant deletion`);
          }
        }
      }
    }

    return {
      success: true,
      updatedProducts: updatedProducts.length,
      deletedProducts: deletedProducts.length,
      details: {
        updatedProducts,
        deletedProducts,
      },
    };
  } catch (error) {
    console.error('[delete-product] ❌ Error deleting variant from shopifyItems:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove product from categories and delete empty categories
 * @param {Object} db - Firestore Admin instance
 * @param {string} storefront - Storefront name
 * @param {string} productId - Product ID to remove
 * @param {Array<string>} categoryIds - Array of category IDs the product belongs to
 * @returns {Promise<Object>} Cleanup result
 */
async function removeProductFromCategories(db, storefront, productId, categoryIds) {
  const deletedCategories = [];
  const updatedCategories = [];
  
  try {
    const categoriesCollection = db.collection(storefront).doc('categories').collection('items');
    
    for (const categoryId of categoryIds) {
      try {
        const categoryRef = categoriesCollection.doc(categoryId);
        const categoryDoc = await categoryRef.get();
        
        if (!categoryDoc.exists) {
          continue; // Category doesn't exist, skip
        }
        
        const categoryData = categoryDoc.data();
        
        // Remove product from previewProductIds if present
        const previewProductIds = Array.isArray(categoryData.previewProductIds) ? categoryData.previewProductIds : [];
        const updatedPreviewIds = previewProductIds.filter(id => id !== productId);
        
        // Check if category has any other products
        // Note: We check all products, not just active ones, because:
        // 1. Products are filtered client-side by multiple criteria (active, hasInStockVariants, totalStock)
        // 2. A category with only inactive products should still be considered empty for display purposes
        const productsCollection = db.collection(storefront).doc('products').collection('items');
        const allProductsSnapshot = await productsCollection.get();
        
        // Filter products that belong to this category
        const categoryProducts = allProductsSnapshot.docs.filter(doc => {
          if (doc.id === productId) return false; // Exclude the deleted product
          const productData = doc.data();
          const productCategoryIds = productData.categoryIds || (productData.categoryId ? [productData.categoryId] : []);
          return productCategoryIds.includes(categoryId);
        });
        
        if (categoryProducts.length === 0) {
          // No active products left in category - delete the category
          await categoryRef.delete();
          deletedCategories.push({
            storefront,
            categoryId,
          });
          console.log(`[delete-product] 🗑️  Deleted category ${categoryId} from ${storefront} (no products remaining)`);
        } else {
          // Update category to remove product from previewProductIds
          const updateData = {
            previewProductIds: updatedPreviewIds,
            updatedAt: FieldValue.serverTimestamp(),
          };
          
          await categoryRef.update(updateData);
          updatedCategories.push({
            storefront,
            categoryId,
            remainingProducts: categoryProducts.length,
          });
          console.log(`[delete-product] ✅ Updated category ${categoryId} in ${storefront} - removed product from preview, ${categoryProducts.length} product(s) remaining`);
        }
      } catch (error) {
        console.error(`[delete-product] ❌ Error processing category ${categoryId}:`, error);
        // Continue with other categories
      }
    }
    
    return {
      success: true,
      deletedCategories: deletedCategories.length,
      updatedCategories: updatedCategories.length,
      details: {
        deletedCategories,
        updatedCategories,
      },
    };
  } catch (error) {
    console.error('[delete-product] ❌ Error removing product from categories:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete all variants of a product when the entire product is deleted from Shopify
 * @param {string} shopifyProductId - Shopify product ID
 * @param {Array<Object>} allVariants - Array of variant objects with id and inventory_item_id (optional - will be fetched if not provided)
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteAllProductVariants(shopifyProductId, allVariants = []) {
  console.log(`[delete-product] 🗑️  Deleting all variants for product ${shopifyProductId}${allVariants.length > 0 ? ` (${allVariants.length} variant(s) known)` : ' (will find all variants)'}...`);
  
  const deletedVariants = [];
  const deletedProducts = [];
  const updatedProducts = [];
  
  try {
    const db = getAdminDb();
    if (!db) {
      return { success: false, error: 'Admin DB not available' };
    }

    // Delete from shopifyItems first
    const shopifyCollection = db.collection('shopifyItems');
    const shopifyItemsSnapshot = await shopifyCollection.get();
    
    for (const shopifyDoc of shopifyItemsSnapshot.docs) {
      const shopifyData = shopifyDoc.data();
      const rawProduct = shopifyData.rawProduct;
      const productShopifyId = shopifyData.shopifyId || rawProduct?.id;
      
      if (productShopifyId?.toString() === shopifyProductId.toString()) {
        // Get product's categoryIds before deleting
        const productCategoryIds = shopifyData.categoryIds || [];
        
        // Delete the entire product document
        await shopifyDoc.ref.delete();
        console.log(`[delete-product] 🗑️  Deleted product ${shopifyDoc.id} from shopifyItems (product ${shopifyProductId} deleted from Shopify)`);
      }
    }

    // Delete from all storefronts
    const collections = await db.listCollections();
    const storefronts = [];
    
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

    // Delete all variants and products from storefronts
    for (const storefront of storefronts) {
      try {
        const productsCollection = db.collection(storefront).doc('products').collection('items');
        const productsSnapshot = await productsCollection.where('sourceShopifyId', '==', shopifyProductId.toString()).get();
        
        for (const productDoc of productsSnapshot.docs) {
          const productData = productDoc.data();
          const productCategoryIds = productData.categoryIds || (productData.categoryId ? [productData.categoryId] : []);
          const variantsCollection = productDoc.ref.collection('variants');
          const variantsSnapshot = await variantsCollection.get();
          
          // Delete all variants
          for (const variantDoc of variantsSnapshot.docs) {
            await variantDoc.ref.delete();
            deletedVariants.push({
              storefront,
              productId: productDoc.id,
              variantId: variantDoc.id,
            });
          }
          
          // Delete the product
          await productDoc.ref.delete();
          deletedProducts.push({
            storefront,
            productId: productDoc.id,
            categoryIds: productCategoryIds,
          });
          
          console.log(`[delete-product] 🗑️  Deleted product ${productDoc.id} from ${storefront} (product ${shopifyProductId} deleted from Shopify)`);
        }
      } catch (error) {
        console.error(`[delete-product] ❌ Error processing storefront ${storefront}:`, error);
      }
    }

    // Clean up categories
    const categoryCleanupResults = [];
    for (const deletedProduct of deletedProducts) {
      if (deletedProduct.categoryIds && deletedProduct.categoryIds.length > 0) {
        const cleanupResult = await removeProductFromCategories(
          getAdminDb(),
          deletedProduct.storefront,
          deletedProduct.productId,
          deletedProduct.categoryIds
        );
        categoryCleanupResults.push({
          storefront: deletedProduct.storefront,
          productId: deletedProduct.productId,
          ...cleanupResult,
        });
      }
    }
    
    const totalDeletedCategories = categoryCleanupResults.reduce((sum, r) => sum + (r.details?.deletedCategories?.length || 0), 0);
    const totalUpdatedCategories = categoryCleanupResults.reduce((sum, r) => sum + (r.details?.updatedCategories?.length || 0), 0);

    console.log(`[delete-product] ✅ Product deletion complete:`);
    console.log(`[delete-product]    - ShopifyItems: 1 product deleted`);
    console.log(`[delete-product]    - Storefronts: ${deletedVariants.length} variants deleted, ${deletedProducts.length} products deleted`);
    console.log(`[delete-product]    - Categories: ${totalUpdatedCategories} updated, ${totalDeletedCategories} deleted`);

    return {
      success: true,
      shopifyItems: {
        deletedProducts: 1,
      },
      storefronts: {
        deletedVariants: deletedVariants.length,
        deletedProducts: deletedProducts.length,
        updatedProducts: 0,
        details: {
          deletedVariants,
          deletedProducts,
          updatedProducts: [],
        },
      },
      categories: {
        deletedCategories: totalDeletedCategories,
        updatedCategories: totalUpdatedCategories,
        details: categoryCleanupResults,
      },
    };
  } catch (error) {
    console.error(`[delete-product] ❌ Error deleting product ${shopifyProductId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a variant/product that has been removed from Shopify
 * @param {string|number} shopifyVariantId - Shopify variant ID
 * @param {string} inventoryItemId - Inventory item ID (for matching)
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteDeletedProduct(shopifyVariantId, inventoryItemId) {
  console.log(`[delete-product] 🗑️  Deleting variant ${shopifyVariantId} (inventoryItemId: ${inventoryItemId}) from database...`);
  
  try {
    // Delete from shopifyItems first (authoritative source)
    const shopifyItemsResult = await deleteVariantFromShopifyItems(inventoryItemId);
    
    // Then delete from storefronts
    const storefrontsResult = await deleteVariantFromStorefronts(shopifyVariantId, inventoryItemId);
    
    // Collect category cleanup info from deleted products
    const categoryCleanupResults = [];
    for (const deletedProduct of storefrontsResult.details.deletedProducts || []) {
      if (deletedProduct.categoryIds && deletedProduct.categoryIds.length > 0) {
        const cleanupResult = await removeProductFromCategories(
          getAdminDb(),
          deletedProduct.storefront,
          deletedProduct.productId,
          deletedProduct.categoryIds
        );
        categoryCleanupResults.push({
          storefront: deletedProduct.storefront,
          productId: deletedProduct.productId,
          ...cleanupResult,
        });
      }
    }
    
    const totalDeletedCategories = categoryCleanupResults.reduce((sum, r) => sum + (r.details?.deletedCategories?.length || 0), 0);
    const totalUpdatedCategories = categoryCleanupResults.reduce((sum, r) => sum + (r.details?.updatedCategories?.length || 0), 0);
    
    console.log(`[delete-product] ✅ Deletion complete:`);
    console.log(`[delete-product]    - ShopifyItems: ${shopifyItemsResult.updatedProducts} updated, ${shopifyItemsResult.deletedProducts} products emptied`);
    console.log(`[delete-product]    - Storefronts: ${storefrontsResult.deletedVariants} variants deleted, ${storefrontsResult.updatedProducts} products updated, ${storefrontsResult.deletedProducts} products deleted`);
    console.log(`[delete-product]    - Categories: ${totalUpdatedCategories} updated, ${totalDeletedCategories} deleted`);
    
    return {
      success: true,
      shopifyItems: shopifyItemsResult,
      storefronts: storefrontsResult,
      categories: {
        deletedCategories: totalDeletedCategories,
        updatedCategories: totalUpdatedCategories,
        details: categoryCleanupResults,
      },
    };
  } catch (error) {
    console.error(`[delete-product] ❌ Error deleting variant ${shopifyVariantId}:`, error);
    return { success: false, error: error.message };
  }
}

