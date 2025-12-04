#!/usr/bin/env node

/**
 * One-time script to sync stock from shopifyItems (single source of truth) to all storefront products.
 * 
 * This script:
 * 1. Fetches all products from shopifyItems collection (authoritative source)
 * 2. For each Shopify product, finds all storefront products that reference it
 * 3. Calculates stock from shopifyItems.rawProduct.variants
 * 4. Updates all storefront product documents and their variants with the correct stock
 * 
 * ARCHITECTURE:
 * - shopifyItems = Single source of truth (updated first by webhooks)
 * - {storefront}/products = Denormalized copies (for fast queries)
 * 
 * This script ensures consistency between shopifyItems and storefront products.
 * 
 * Usage:
 *   export FIREBASE_PROJECT_ID=ecom-store-generator-41064
 *   export FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ecom-store-generator-41064.iam.gserviceaccount.com
 *   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *   node scripts/sync-stock-from-shopify.js
 * 
 * Or use Application Default Credentials:
 *   gcloud auth application-default login
 *   node scripts/sync-stock-from-shopify.js
 */

const admin = require('firebase-admin');

const DEFAULT_PROJECT_ID = 'ecom-store-generator-41064';

// Known storefronts - update this list as needed
const STOREFRONTS = ['LUNERA', 'FIVESTARFINDS', 'GIFTSHOP'];

function initializeAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    // Fallback to ADC
    admin.initializeApp({
      projectId: DEFAULT_PROJECT_ID,
    });
  }

  return admin.app();
}

/**
 * Calculate product-level stock status from variants
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
    // Support multiple field names for stock in shopifyItems
    const stock = variant.inventory_quantity || 
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
 * Sync stock from shopifyItems to a specific storefront product
 */
async function syncStockToStorefrontProduct(db, storefront, productDoc, shopifyItemData) {
  const productData = productDoc.data();
  const rawProduct = shopifyItemData.rawProduct;
  
  if (!rawProduct || !rawProduct.variants) {
    console.log(`  ⚠️  No variants in shopifyItem for product ${productDoc.id}`);
    return { updated: false, reason: 'no_variants' };
  }

  // Calculate stock from shopifyItems (authoritative source)
  const stockStatus = calculateProductStockFromVariants(rawProduct.variants);
  
  // Check if product needs update
  const currentTotalStock = productData.totalStock || 0;
  const currentHasInStock = productData.hasInStockVariants !== undefined 
    ? productData.hasInStockVariants 
    : null;
  
  const needsProductUpdate = 
    currentTotalStock !== stockStatus.totalStock ||
    currentHasInStock !== stockStatus.hasInStockVariants ||
    (productData.inStockVariantCount || 0) !== stockStatus.inStockVariantCount ||
    (productData.totalVariantCount || 0) !== stockStatus.totalVariantCount;

  // Update product-level stock fields
  if (needsProductUpdate) {
    await productDoc.ref.update({
      totalStock: stockStatus.totalStock,
      hasInStockVariants: stockStatus.hasInStockVariants,
      inStockVariantCount: stockStatus.inStockVariantCount,
      totalVariantCount: stockStatus.totalVariantCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Update variants - match by shopifyInventoryItemId or shopifyVariantId
  const variantsCollection = productDoc.ref.collection('variants');
  const variantsSnapshot = await variantsCollection.get();
  
  let variantUpdates = 0;
  const shopifyVariantsByInventoryItemId = new Map();
  const shopifyVariantsByVariantId = new Map();
  
  // Index shopifyItem variants by inventory_item_id and variant id
  rawProduct.variants.forEach((shopifyVariant) => {
    const inventoryItemId = shopifyVariant.inventory_item_id?.toString();
    const variantId = shopifyVariant.id?.toString();
    const stock = shopifyVariant.inventory_quantity || 
                 shopifyVariant.inventoryQuantity || 
                 shopifyVariant.inventory_quantity_total || 
                 0;
    
    if (inventoryItemId) {
      shopifyVariantsByInventoryItemId.set(inventoryItemId, {
        stock,
        inventory_levels: shopifyVariant.inventory_levels || [],
      });
    }
    if (variantId) {
      shopifyVariantsByVariantId.set(variantId, {
        stock,
        inventory_levels: shopifyVariant.inventory_levels || [],
      });
    }
  });

  // Update each storefront variant
  for (const variantDoc of variantsSnapshot.docs) {
    const variantData = variantDoc.data();
    let stockToUse = null;
    let inventoryLevelsToUse = null;

    // Try to match by shopifyInventoryItemId first (most reliable)
    if (variantData.shopifyInventoryItemId) {
      const shopifyVariant = shopifyVariantsByInventoryItemId.get(
        variantData.shopifyInventoryItemId.toString()
      );
      if (shopifyVariant) {
        stockToUse = shopifyVariant.stock;
        inventoryLevelsToUse = shopifyVariant.inventory_levels;
      }
    }

    // Fallback to shopifyVariantId
    if (stockToUse === null && variantData.shopifyVariantId) {
      const shopifyVariant = shopifyVariantsByVariantId.get(
        variantData.shopifyVariantId.toString()
      );
      if (shopifyVariant) {
        stockToUse = shopifyVariant.stock;
        inventoryLevelsToUse = shopifyVariant.inventory_levels;
      }
    }

    // Update variant if stock changed
    if (stockToUse !== null) {
      const currentStock = variantData.stock || 0;
      const needsVariantUpdate = currentStock !== stockToUse;

      if (needsVariantUpdate) {
        const updateData = {
          stock: stockToUse,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Update inventory_levels if available
        if (inventoryLevelsToUse && Array.isArray(inventoryLevelsToUse)) {
          updateData.inventory_levels = inventoryLevelsToUse;
        }

        await variantDoc.ref.update(updateData);
        variantUpdates++;
      }
    }
  }

  return {
    updated: needsProductUpdate || variantUpdates > 0,
    productUpdated: needsProductUpdate,
    variantUpdates,
  };
}

/**
 * Sync stock from shopifyItems to all storefront products
 */
async function syncStockFromShopifyItems(db) {
  console.log('\n📦 Fetching all products from shopifyItems (authoritative source)...\n');
  
  const shopifyItemsCollection = db.collection('shopifyItems');
  const shopifyItemsSnapshot = await shopifyItemsCollection.get();
  
  if (shopifyItemsSnapshot.empty) {
    console.log('  ⚠️  No products found in shopifyItems collection');
    return { updated: 0, skipped: 0, errors: 0 };
  }
  
  console.log(`  Found ${shopifyItemsSnapshot.size} product(s) in shopifyItems\n`);
  
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalVariantUpdates = 0;

  // Process each shopifyItem
  for (const shopifyItemDoc of shopifyItemsSnapshot.docs) {
    try {
      const shopifyItemData = shopifyItemDoc.data();
      const shopifyId = shopifyItemData.shopifyId;
      const sourceShopifyItemDocId = shopifyItemDoc.id;
      
      if (!shopifyId) {
        console.log(`  ⏭️  Skipping shopifyItem ${sourceShopifyItemDocId} - no shopifyId`);
        totalSkipped++;
        continue;
      }

      const productName = shopifyItemData.rawProduct?.title || shopifyItemData.name || sourceShopifyItemDocId;
      console.log(`  🔄 Processing: ${productName} (shopifyId: ${shopifyId})`);

      // Find all storefront products that reference this shopifyItem
      let foundAny = false;

      for (const storefront of STOREFRONTS) {
        try {
          const productsCollection = db.collection(storefront).doc('products').collection('items');
          
          // Find by sourceShopifyId
          const productsByShopifyId = await productsCollection
            .where('sourceShopifyId', '==', shopifyId.toString())
            .get();
          
          // Also find by sourceShopifyItemDocId if it exists
          const productsByDocId = await productsCollection
            .where('sourceShopifyItemDocId', '==', sourceShopifyItemDocId)
            .get();
          
          // Combine and deduplicate
          const allProductDocs = new Map();
          productsByShopifyId.docs.forEach(doc => allProductDocs.set(doc.id, doc));
          productsByDocId.docs.forEach(doc => allProductDocs.set(doc.id, doc));

          if (allProductDocs.size === 0) {
            continue; // No products in this storefront
          }

          foundAny = true;

          // Update each storefront product
          for (const [productId, productDoc] of allProductDocs) {
            const result = await syncStockToStorefrontProduct(
              db,
              storefront,
              productDoc,
              shopifyItemData
            );

            if (result.updated) {
              totalUpdated++;
              totalVariantUpdates += result.variantUpdates || 0;
              console.log(`    ✅ Updated in ${storefront}: Stock=${result.productUpdated ? 'updated' : 'same'}, Variants=${result.variantUpdates || 0}`);
            } else {
              console.log(`    ⏭️  Already synced in ${storefront}`);
            }
          }
        } catch (error) {
          console.error(`    ❌ Error processing storefront ${storefront}:`, error.message);
          totalErrors++;
        }
      }

      if (!foundAny) {
        console.log(`    ⚠️  No storefront products found for this shopifyItem`);
        totalSkipped++;
      }
    } catch (error) {
      console.error(`  ❌ Error processing shopifyItem ${shopifyItemDoc.id}:`, error.message);
      totalErrors++;
    }
  }

  return {
    updated: totalUpdated,
    skipped: totalSkipped,
    errors: totalErrors,
    variantUpdates: totalVariantUpdates,
  };
}

async function main() {
  console.log('🔄 Starting stock sync from shopifyItems to storefront products...');
  console.log('📋 Architecture: shopifyItems = Single Source of Truth\n');

  const app = initializeAdmin();
  const db = app.firestore();

  const result = await syncStockFromShopifyItems(db);

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`  ✅ Updated: ${result.updated} product(s)`);
  console.log(`  🔧 Variant updates: ${result.variantUpdates} variant(s)`);
  console.log(`  ⏭️  Skipped: ${result.skipped} product(s)`);
  console.log(`  ❌ Errors: ${result.errors} product(s)`);
  console.log('='.repeat(60));

  if (result.errors === 0) {
    console.log('\n✅ Stock sync completed successfully!');
    console.log('💡 All storefront products now match shopifyItems (single source of truth)');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Completed with ${result.errors} error(s).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

