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
 * Get list of storefronts by checking root-level collections
 */
async function getStorefronts(db) {
  const storefronts = [];
  try {
    const collections = await db.listCollections();
    for (const coll of collections) {
      const id = coll.id;
      // Storefronts are root folders that have a 'products' subcollection
      // Skip known root collections like 'shopifyItems', 'orders', etc.
      if (id !== 'shopifyItems' && id !== 'orders' && id !== 'carts' && id !== 'users' && id !== 'userEvents' && id !== 'shippingRates') {
        try {
          const itemsSnapshot = await coll.doc('products').collection('items').limit(1).get();
          if (!itemsSnapshot.empty) {
            // It's a storefront (has products)
            storefronts.push(id);
          }
        } catch (e) {
          // Not a storefront, skip
        }
      }
    }
  } catch (error) {
    console.error('Error getting storefronts:', error);
    return ['LUNERA'];
  }
  return storefronts.length > 0 ? storefronts : ['LUNERA'];
}

/**
 * Mark product as deleted/inactive instead of actually deleting
 * This preserves order history and analytics
 */
async function handleProductDeletion(db, shopifyProductId) {
  const shopifyCollection = db.collection('shopifyItems');
  
  // Update Shopify item
  const shopifySnapshot = await shopifyCollection
    .where('shopifyId', '==', shopifyProductId)
    .limit(1)
    .get();
  
  let targetStorefronts = null;
  
  if (!shopifySnapshot.empty) {
    const shopifyDoc = shopifySnapshot.docs[0];
    const shopifyData = shopifyDoc.data();
    
    // Get storefronts array from shopifyItems (respects admin decisions)
    if (shopifyData.storefronts && Array.isArray(shopifyData.storefronts) && shopifyData.storefronts.length > 0) {
      targetStorefronts = shopifyData.storefronts;
      console.log(`[Delete Webhook] Product ${shopifyProductId} has explicit storefronts: [${targetStorefronts.join(', ')}]`);
    }
    
    await shopifyDoc.ref.update({
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`Marked Shopify item ${shopifyDoc.id} as deleted`);
  }

  // Get all storefronts (for fallback if no explicit storefronts)
  const allStorefronts = await getStorefronts(db);
  const storefrontsToUpdate = targetStorefronts || allStorefronts;

  // Update processed products in each storefront - mark as inactive instead of deleting
  const batch = db.batch();
  const updatedIds = [];

  for (const storefront of storefrontsToUpdate) {
    try {
      const productsCollection = db.collection(storefront).doc('products').collection('items');
      // Convert to number for query (products store sourceShopifyId as number)
      const shopifyIdAsNumber = typeof shopifyProductId === 'string' 
        ? Number(shopifyProductId) 
        : shopifyProductId;
      const productSnapshot = await productsCollection
        .where('sourceShopifyId', '==', shopifyIdAsNumber)
        .get();

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

        updatedIds.push({ id: productDoc.id, storefront });
      }
    } catch (error) {
      console.error(`Error updating products in storefront ${storefront}:`, error);
      // Continue with other storefronts
    }
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

