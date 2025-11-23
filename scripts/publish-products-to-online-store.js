#!/usr/bin/env node

// Load environment variables from .env.local automatically
require('dotenv').config({ path: '.env.local' });

/**
 * Script to publish all products to Online Store sales channel
 * 
 * IMPORTANT: We ONLY publish to "Online Store" publication, NOT custom catalogs like "Blerinas"
 * Storefront API tokens must be scoped to "Online Store" publication for this to work correctly
 * 
 * This script will:
 * 1. Fetch all products from shopifyItems collection
 * 2. Check if they're published to Online Store
 * 3. Publish any that aren't published yet
 * 
 * Usage: node scripts/publish-products-to-online-store.js
 */

const admin = require('firebase-admin');

// Dynamic import for ES module
let publishProductToOnlineStore;

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

async function publishAllProductsToOnlineStore() {
  // Load ES module dynamically
  if (!publishProductToOnlineStore) {
    const module = await import('../lib/shopify-admin-graphql.js');
    publishProductToOnlineStore = module.publishProductToOnlineStore;
  }

  console.log('\n🚀 Starting product publication to Online Store...\n');
  
  const products = await getAllShopifyProducts();
  console.log(`📦 Found ${products.length} products in shopifyItems collection\n`);
  
  let publishedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const product of products) {
    try {
      // Skip if already published
      if (product.publishedToOnlineStore === true) {
        console.log(`⏭️  Skipping ${product.title} (ID: ${product.shopifyId}) - already published to Online Store`);
        skippedCount++;
        continue;
      }
      
      const productGid = `gid://shopify/Product/${product.shopifyId}`;
      console.log(`📤 Publishing ${product.title} (ID: ${product.shopifyId})...`);
      
      const publishResult = await publishProductToOnlineStore(productGid);
      
      // Update Firestore
      const docRef = db.collection('shopifyItems').doc(product.id);
      await docRef.update({
        publishedToOnlineStore: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Log indexing status (checkResult is already logged in publishProductToOnlineStore)
      publishedCount++;
      console.log(`✅ Published: ${product.title}\n`);
      
      // Rate limiting - wait 2 seconds between requests (to allow for initial indexing)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed to publish ${product.title} (ID: ${product.shopifyId}):`, error.message || error);
      errorCount++;
    }
  }
  
  console.log('\n📊 Publication Summary:');
  console.log(`  ✅ Published: ${publishedCount}`);
  console.log(`  ⏭️  Skipped (already published): ${skippedCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`  📦 Total: ${products.length}\n`);
  
  if (publishedCount > 0) {
    console.log('✨ Successfully published products to Online Store!\n');
  }
}

// Run the script
publishAllProductsToOnlineStore()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

