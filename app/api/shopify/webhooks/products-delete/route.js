import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firestore-server';

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
 * Mark product as deleted/inactive instead of actually deleting
 * This preserves order history and analytics
 */
async function handleProductDeletion(db, shopifyProductId) {
  const shopifyCollection = db.collection('shopifyItems');
  const productsCollection = db.collection('products');
  
  // Update Shopify item
  const shopifySnapshot = await shopifyCollection
    .where('shopifyId', '==', shopifyProductId)
    .limit(1)
    .get();
  
  if (!shopifySnapshot.empty) {
    const shopifyDoc = shopifySnapshot.docs[0];
    await shopifyDoc.ref.update({
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`Marked Shopify item ${shopifyDoc.id} as deleted`);
  }

  // Update processed product - mark as inactive instead of deleting
  const productSnapshot = await productsCollection
    .where('sourceShopifyId', '==', shopifyProductId.toString())
    .get();

  if (productSnapshot.empty) {
    return [];
  }

  const batch = db.batch();
  const updatedIds = [];

  for (const productDoc of productSnapshot.docs) {
    batch.update(productDoc.ref, {
      active: false,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const variantsCollection = productDoc.ref.collection('variants');
    const variantsSnapshot = await variantsCollection.get();
    variantsSnapshot.docs.forEach((variantDoc) => {
      batch.delete(variantDoc.ref);
    });

    updatedIds.push(productDoc.id);
  }

  await batch.commit();
  console.log(`Marked ${updatedIds.length} processed products as inactive for Shopify product ${shopifyProductId}`);

  return updatedIds;
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      console.error('Missing x-shopify-hmac-sha256 header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify webhook signature
    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    
    // Product delete payload contains the product ID
    const shopifyProductId = payload.id;

    console.log(`Received product deletion webhook: product_id=${shopifyProductId}`);

    const db = getAdminDb();

    // Handle product deletion
    const productIds = await handleProductDeletion(db, shopifyProductId);

    return NextResponse.json({ 
      ok: true, 
      shopifyProductId,
      productIds,
      message: productIds.length > 0 ? 'Products marked as inactive' : 'Products not found in processed products'
    });
  } catch (error) {
    console.error('Product deletion webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification during setup)
export async function GET() {
  return NextResponse.json({ message: 'Shopify product deletion webhook endpoint is active' });
}

