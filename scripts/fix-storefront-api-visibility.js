#!/usr/bin/env node

// Load environment variables from .env.local automatically
require('dotenv').config({ path: '.env.local' });

/**
 * Script to fix Storefront API visibility by unpublishing and re-publishing products
 * 
 * This forces Storefront API to re-index products that aren't being recognized
 * 
 * Usage: node scripts/fix-storefront-api-visibility.js
 */

const admin = require('firebase-admin');

// Dynamic import for ES module
let forceReindexProductInStorefront;

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('../firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function getAllShopifyProducts() {
  const shopifyItemsRef = db.collection('shopifyItems');
  const snapshot = await shopifyItemsRef.get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    shopifyId: doc.data().shopifyId,
    title: doc.data().title,
    publishedToOnlineStore: doc.data().publishedToOnlineStore || false,
  }));
}

async function fixStorefrontApiVisibility() {
  // Load ES module dynamically
  if (!forceReindexProductInStorefront) {
    const module = await import('../lib/shopify-admin-graphql.js');
    forceReindexProductInStorefront = module.forceReindexProductInStorefront;
  }

  console.log('\n🔧 Starting Storefront API visibility fix...\n');
  console.log('This will unpublish and re-publish products to force Storefront API re-indexing\n');
  
  const products = await getAllShopifyProducts();
  console.log(`📦 Found ${products.length} products in shopifyItems collection\n`);
  
  let fixedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const product of products) {
    try {
      // Skip if not published (no need to fix)
      if (product.publishedToOnlineStore === false) {
        console.log(`⏭️  Skipping ${product.title} (ID: ${product.shopifyId}) - not published to Online Store`);
        skippedCount++;
        continue;
      }
      
      const productGid = `gid://shopify/Product/${product.shopifyId}`;
      console.log(`🔧 Fixing ${product.title} (ID: ${product.shopifyId})...`);
      console.log(`   Unpublishing...`);
      
      await forceReindexProductInStorefront(productGid);
      
      // Update Firestore (keep publishedToOnlineStore as true since we re-published)
      const docRef = db.collection('shopifyItems').doc(product.id);
      await docRef.update({
        publishedToOnlineStore: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      fixedCount++;
      console.log(`   ✅ Fixed: ${product.title}\n`);
      
      // Rate limiting - wait 3 seconds between products (to allow for propagation)
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`   ❌ Failed to fix ${product.title} (ID: ${product.shopifyId}):`, error.message || error);
      errorCount++;
      console.log('');
    }
  }
  
  console.log('\n📊 Fix Summary:');
  console.log(`  ✅ Fixed: ${fixedCount} products`);
  console.log(`  ⏭️  Skipped: ${skippedCount} (not published)`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`  📦 Total: ${products.length}\n`);
  
  if (fixedCount > 0) {
    console.log('✨ Successfully fixed Storefront API visibility!\n');
    console.log('⏳ Please wait 30 seconds for Storefront API to re-index, then test checkout.\n');
  }
}

// Run the script
fixStorefrontApiVisibility()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

