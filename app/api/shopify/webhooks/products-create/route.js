import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firestore-server';
import { getProductMarkets, publishProductToOnlineStore } from '@/lib/shopify-admin-graphql';
import { buildMarketsArray } from '@/lib/market-utils';

/**
 * Verify Shopify webhook HMAC signature
 */
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

/**
 * Extract image URLs from Shopify product
 */
function extractImageUrls(product) {
  return (product.images || [])
    .map((img) => (typeof img === 'object' ? img.src : img))
    .filter(Boolean);
}

/**
 * Category assignment happens when products are manually added to storefronts through the admin interface.
 * Products in shopifyItems don't have categories yet - they will be assigned when moved to storefronts.
 */

/**
 * Generate document ID from product
 */
function generateDocumentId(product) {
  if (product.handle) {
    return product.handle.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  if (product.title) {
    const slug = product.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) return slug;
  }
  return `shopify-product-${product.id}`;
}

/**
 * Store new Shopify product in staging area
 */
async function storeShopifyProduct(db, shopifyProduct) {
  const shopifyCollection = db.collection('shopifyItems');
  
  // Category will be assigned when product is manually added to a storefront
  const categorySlug = null;
  const documentId = generateDocumentId(shopifyProduct);
  const docRef = shopifyCollection.doc(documentId);
  
  const tags = shopifyProduct.tags
    ? shopifyProduct.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];

  // Query product markets and Online Store publication status from Shopify Admin GraphQL API
  let markets = [];
  let publishedToOnlineStore = false;
  try {
    const productGid = `gid://shopify/Product/${shopifyProduct.id}`;
    console.log(`[Product Webhook] Fetching markets and publication status for product: ${shopifyProduct.id} (${shopifyProduct.title})`);
    const marketInfo = await getProductMarkets(productGid);
    markets = buildMarketsArray(marketInfo);
    publishedToOnlineStore = marketInfo.publishedToOnlineStore || false;
    console.log(`[Product Webhook] Product ${shopifyProduct.id} (${shopifyProduct.title}) - Markets: [${markets.join(', ') || 'none'}], Online Store: ${publishedToOnlineStore ? '✅' : '❌'}`);
    
    if (!publishedToOnlineStore) {
      console.warn(`[Product Webhook] ⚠️  Product ${shopifyProduct.id} (${shopifyProduct.title}) is NOT published to Online Store - will not be accessible via Storefront API`);
    }
  } catch (error) {
    console.error(`[Product Webhook] Failed to get markets/publication status for product ${shopifyProduct.id}:`, error.message || error);
    // Continue without markets/publication status - they'll be empty/false
  }

  const payload = {
    shopifyId: shopifyProduct.id,
    title: shopifyProduct.title,
    handle: shopifyProduct.handle || null,
    status: shopifyProduct.status || null,
    vendor: shopifyProduct.vendor || null,
    productType: shopifyProduct.product_type || null,
    tags,
    markets, // Add markets array
    publishedToOnlineStore, // Store Online Store publication status
    matchedCategorySlug: categorySlug || null,
    imageUrls: extractImageUrls(shopifyProduct),
    rawProduct: shopifyProduct,
    slug: documentId,
    storefronts: [],
    processedStorefronts: [],
    autoProcess: false,
    fetchedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(payload, { merge: true });
  console.log(`Stored new Shopify product: ${documentId} (Shopify ID: ${shopifyProduct.id})`);
  
  // Auto-publish product to Online Store if not already published
  if (!publishedToOnlineStore) {
    try {
      const productGid = `gid://shopify/Product/${shopifyProduct.id}`;
      console.log(`[Product Webhook] Auto-publishing product ${shopifyProduct.id} to Online Store...`);
      await publishProductToOnlineStore(productGid);
      
      // Update Firestore with new publication status
      await docRef.update({
        publishedToOnlineStore: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[Product Webhook] ✅ Auto-published product ${shopifyProduct.id} to Online Store`);
    } catch (error) {
      console.error(`[Product Webhook] ⚠️  Failed to auto-publish product ${shopifyProduct.id} to Online Store:`, error.message || error);
      // Don't throw - webhook should still succeed even if auto-publish fails
    }
  }
  
  return { documentId, matchedCategorySlug: categorySlug };
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

    const payload = JSON.parse(rawBody);
    const shopifyProduct = payload;

    console.log(`Received product creation webhook: product_id=${shopifyProduct.id}, title=${shopifyProduct.title}`);

    const db = getAdminDb();
    const { documentId, matchedCategorySlug } = await storeShopifyProduct(db, shopifyProduct);

    return NextResponse.json({ 
      ok: true, 
      shopifyProductId: shopifyProduct.id,
      documentId,
      matchedCategory: matchedCategorySlug || null,
      message: 'Product stored in staging area - ready for processing',
    });
  } catch (error) {
    console.error('Product creation webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Shopify product creation webhook endpoint is active' });
}

