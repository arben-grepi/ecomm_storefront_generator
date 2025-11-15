#!/usr/bin/env node

/**
 * Import products from Shopify API and match them to categories.
 * 
 * This script:
 * 1. Fetches products from Shopify Admin API
 * 2. Matches products to categories using tags, product type, and keywords
 * 3. Imports matching products into Firestore
 *
 * Usage:
 *   # Set Shopify credentials
 *   export SHOPIFY_STORE_URL=your-store.myshopify.com
 *   export SHOPIFY_ACCESS_TOKEN=your_access_token
 *   
 *   # Set Firebase credentials (optional if using ADC)
 *   export FIREBASE_PROJECT_ID=ecommerce-2f366
 *   export FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@ecommerce-2f366.iam.gserviceaccount.com
 *   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *   
 *   node scripts/import-shopify-products.js
 */

const admin = require('firebase-admin');

const DEFAULT_PROJECT_ID = 'ecommerce-generator-4c007';

// Category matching configuration
const CATEGORY_MATCHING = {
  lingerie: {
    keywords: ['lingerie', 'bra', 'bralette', 'bra set', 'corset', 'bustier', 'teddy', 'bodysuit', 'garter', 'stockings', 'thong', 'panties set', 'matching set'],
    productTypes: ['lingerie', 'bra', 'bralette', 'underwear set'],
    tags: ['lingerie', 'bra', 'bralette', 'matching set'],
  },
  underwear: {
    keywords: ['underwear', 'panties', 'brief', 'thong', 'g-string', 'boy short', 'hipster', 'bikini', 'underwear set'],
    productTypes: ['underwear', 'panties', 'briefs', 'thong'],
    tags: ['underwear', 'panties', 'briefs', 'thong'],
  },
  sports: {
    keywords: ['sport', 'activewear', 'athletic', 'yoga', 'gym', 'workout', 'fitness', 'running', 'leggings', 'sports bra', 'athletic wear'],
    productTypes: ['activewear', 'sportswear', 'athletic', 'yoga wear'],
    tags: ['sport', 'activewear', 'athletic', 'yoga', 'fitness'],
  },
  dresses: {
    keywords: ['dress', 'gown', 'frock', 'evening dress', 'cocktail dress', 'maxi dress', 'midi dress', 'mini dress'],
    productTypes: ['dress', 'gown', 'evening wear'],
    tags: ['dress', 'gown', 'evening'],
  },
  clothes: {
    keywords: ['top', 'shirt', 'blouse', 'sweater', 'cardigan', 'jacket', 'coat', 'pants', 'trousers', 'skirt', 'shorts', 'jumpsuit', 'romper'],
    productTypes: ['top', 'shirt', 'blouse', 'sweater', 'jacket', 'pants', 'skirt'],
    tags: ['clothing', 'apparel', 'fashion'],
  },
};

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
    admin.initializeApp({
      projectId: DEFAULT_PROJECT_ID,
    });
  }

  return admin.app();
}

const db = initializeAdmin().firestore();
const FieldValue = admin.firestore.FieldValue;

const slugify = (value) =>
  value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const generateDocumentId = (product) => {
  if (product.handle) {
    return slugify(product.handle);
  }
  if (product.title) {
    const slug = slugify(product.title);
    if (slug) return slug;
  }
  return `shopify-product-${product.id}`;
};

const extractImageUrls = (product) =>
  (product.images || [])
    .map((img) => (typeof img === 'object' ? img.src : img))
    .filter(Boolean);

const buildShopifyDocument = (product, matchedCategorySlug) => {
  const tags = product.tags
    ? product.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  return {
    shopifyId: product.id,
    title: product.title,
    handle: product.handle || null,
    status: product.status || null,
    vendor: product.vendor || null,
    productType: product.product_type || null,
    tags,
    matchedCategorySlug: matchedCategorySlug || null,
    imageUrls: extractImageUrls(product),
    rawProduct: product,
    storefronts: [],
    processedStorefronts: [],
  };
};

/**
 * Match a Shopify product to a category using multiple strategies
 */
function matchProductToCategory(product) {
  const title = (product.title || '').toLowerCase();
  const description = (product.body_html || '').toLowerCase();
  const productType = (product.product_type || '').toLowerCase();
  const tags = (product.tags || '').toLowerCase().split(',').map(t => t.trim());
  
  // Score each category
  const scores = {};
  
  for (const [categorySlug, config] of Object.entries(CATEGORY_MATCHING)) {
    let score = 0;
    
    // Check keywords in title and description
    for (const keyword of config.keywords) {
      if (title.includes(keyword)) score += 3;
      if (description.includes(keyword)) score += 1;
    }
    
    // Check product type
    if (config.productTypes.some(pt => productType.includes(pt))) {
      score += 5;
    }
    
    // Check tags
    for (const tag of tags) {
      if (config.tags.some(configTag => tag.includes(configTag))) {
        score += 4;
      }
    }
    
    if (score > 0) {
      scores[categorySlug] = score;
    }
  }
  
  // Return category with highest score, or null if no match
  const entries = Object.entries(scores);
  if (entries.length === 0) return null;
  
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * Fetch all products from Shopify API with pagination
 */
async function fetchAllShopifyProducts(storeUrl, accessToken) {
  const products = [];
  let pageInfo = null;
  let hasNextPage = true;
  
  const baseUrl = `https://${storeUrl}/admin/api/2025-01/products.json`;
  
  while (hasNextPage) {
    let url = baseUrl;
    if (pageInfo) {
      url += `?page_info=${pageInfo}`;
    }
    
    try {
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      const data = await response.json();
      const pageProducts = data.products || [];
      products.push(...pageProducts);
      
      // Check for pagination
      const linkHeader = response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]+page_info=([^>]+)>[^<]*rel="next"/);
        if (nextMatch) {
          pageInfo = nextMatch[1];
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
      
      console.log(`  • Fetched ${pageProducts.length} products (total: ${products.length})`);
      
      // Rate limiting: Shopify allows 2 requests per second, so wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error fetching products:`, error);
      throw error;
    }
  }
  
  return products;
}

/**
 * Import products from Shopify
 */
async function importProducts() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!storeUrl || !accessToken) {
    throw new Error('Missing required environment variables: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN');
  }
  
  console.log(`\n🛍️  Fetching products from Shopify store: ${storeUrl}`);
  console.log('This may take a while depending on the number of products...\n');
  
  // Fetch all products
  const shopifyProducts = await fetchAllShopifyProducts(storeUrl, accessToken);
  console.log(`\n✅ Fetched ${shopifyProducts.length} products from Shopify\n`);
  
  const shopifyCollection = db.collection('shopifyItems');
  let totalUpserted = 0;
  let totalSkipped = 0;
  let matchedCount = 0;
  const unmatchedProducts = [];
  
  for (const product of shopifyProducts) {
    const documentId = generateDocumentId(product);
    const docRef = shopifyCollection.doc(documentId);
    
    // Check if product already exists
    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
      console.log(`  ⏭️  Skipping ${product.title} (ID: ${product.id}) - already imported`);
      totalSkipped += 1;
      continue;
    }
    
    console.log(`\n🧾 Importing new Shopify product: ${product.title} (ID: ${product.id})`);
    console.dir(product, { depth: null });
    
    const categorySlug = matchProductToCategory(product);
    if (categorySlug) {
      matchedCount += 1;
    } else {
      unmatchedProducts.push(product);
    }
    
    const payload = buildShopifyDocument(product, categorySlug);
    
    await docRef.set(
      {
        ...payload,
        slug: documentId,
        fetchedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    
    console.log(`  ✅ Stored at shopifyItems/${documentId}`);
    totalUpserted += 1;
  }
  
  console.log(`\n📊 Matching summary:`);
  console.log(`  • Category guess available: ${matchedCount} products`);
  console.log(`  • No category guess: ${unmatchedProducts.length} products`);
  
  if (unmatchedProducts.length > 0) {
    console.log('Unmatched products (first 10):');
    unmatchedProducts.slice(0, 10).forEach((p) => {
      console.log(`  - ${p.title} (Type: ${p.product_type || 'N/A'}, Tags: ${p.tags || 'N/A'})`);
    });
    if (unmatchedProducts.length > 10) {
      console.log(`  ... and ${unmatchedProducts.length - 10} more`);
    }
  }
  
  console.log(`\n✅ Shopify sync complete!`);
  console.log(`  • Imported: ${totalUpserted} new products`);
  console.log(`  • Skipped: ${totalSkipped} already imported products`);
  console.log(`  • Total processed: ${totalUpserted + totalSkipped} products`);
}

async function main() {
  try {
    await importProducts();
  } catch (error) {
    console.error('❌ Failed to import products:', error);
    process.exitCode = 1;
  } finally {
    await admin.app().delete().catch(() => {});
  }
}

main();

