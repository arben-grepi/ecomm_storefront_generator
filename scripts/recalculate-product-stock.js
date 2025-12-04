#!/usr/bin/env node

/**
 * One-time script to recalculate and update product-level stock for all products.
 * 
 * This script:
 * 1. Fetches all products from all storefronts
 * 2. For each product, loads all variants
 * 3. Calculates totalStock, hasInStockVariants, inStockVariantCount, totalVariantCount
 * 4. Updates the product document with these calculated values
 * 
 * Usage:
 *   export FIREBASE_PROJECT_ID=ecom-store-generator-41064
 *   export FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ecom-store-generator-41064.iam.gserviceaccount.com
 *   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *   node scripts/recalculate-product-stock.js
 * 
 * Or use Application Default Credentials:
 *   gcloud auth application-default login
 *   node scripts/recalculate-product-stock.js
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
function calculateProductStock(variants) {
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

async function recalculateStockForStorefront(db, storefront) {
  console.log(`\n📦 Processing storefront: ${storefront}`);
  
  const productsCollection = db.collection(storefront).doc('products').collection('items');
  const productsSnapshot = await productsCollection.get();
  
  if (productsSnapshot.empty) {
    console.log(`  ⚠️  No products found in ${storefront}`);
    return { updated: 0, skipped: 0, errors: 0 };
  }
  
  console.log(`  Found ${productsSnapshot.size} product(s)`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const productDoc of productsSnapshot.docs) {
    try {
      const productId = productDoc.id;
      const productData = productDoc.data();
      
      // Load all variants for this product
      const variantsCollection = productDoc.ref.collection('variants');
      const variantsSnapshot = await variantsCollection.get();
      
      const variants = variantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      // Calculate stock status
      const stockStatus = calculateProductStock(variants);
      
      // Check if update is needed
      const currentTotalStock = productData.totalStock || 0;
      const currentHasInStock = productData.hasInStockVariants !== undefined 
        ? productData.hasInStockVariants 
        : null;
      
      const needsUpdate = 
        currentTotalStock !== stockStatus.totalStock ||
        currentHasInStock !== stockStatus.hasInStockVariants ||
        (productData.inStockVariantCount || 0) !== stockStatus.inStockVariantCount ||
        (productData.totalVariantCount || 0) !== stockStatus.totalVariantCount;
      
      if (needsUpdate) {
        await productDoc.ref.update({
          totalStock: stockStatus.totalStock,
          hasInStockVariants: stockStatus.hasInStockVariants,
          inStockVariantCount: stockStatus.inStockVariantCount,
          totalVariantCount: stockStatus.totalVariantCount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        updated++;
        console.log(`  ✅ Updated: ${productData.name || productId} - Stock: ${stockStatus.totalStock} (${stockStatus.inStockVariantCount}/${stockStatus.totalVariantCount} variants in stock)`);
      } else {
        skipped++;
        console.log(`  ⏭️  Skipped: ${productData.name || productId} - Already correct (Stock: ${stockStatus.totalStock})`);
      }
    } catch (error) {
      errors++;
      console.error(`  ❌ Error processing product ${productDoc.id}:`, error.message);
    }
  }
  
  return { updated, skipped, errors };
}

async function main() {
  console.log('🔄 Starting product stock recalculation...\n');
  
  const app = initializeAdmin();
  const db = app.firestore();
  
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  for (const storefront of STOREFRONTS) {
    try {
      const result = await recalculateStockForStorefront(db, storefront);
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    } catch (error) {
      console.error(`❌ Error processing storefront ${storefront}:`, error);
      totalErrors++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`  ✅ Updated: ${totalUpdated} product(s)`);
  console.log(`  ⏭️  Skipped: ${totalSkipped} product(s) (already correct)`);
  console.log(`  ❌ Errors: ${totalErrors} product(s)`);
  console.log('='.repeat(60));
  
  if (totalErrors === 0) {
    console.log('\n✅ Stock recalculation completed successfully!');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Completed with ${totalErrors} error(s).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

