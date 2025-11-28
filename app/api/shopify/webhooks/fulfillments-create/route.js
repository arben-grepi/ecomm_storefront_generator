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
 * Update order fulfillment information
 */
async function updateOrderFulfillment(db, fulfillment, orderId) {
  const ordersCollection = db.collection('orders');
  
  // Find order by Shopify order ID
  const orderSnapshot = await ordersCollection
    .where('shopifyOrderId', '==', orderId.toString())
    .limit(1)
    .get();

  if (!orderSnapshot.empty) {
    const orderDoc = orderSnapshot.docs[0];
    
    const fulfillmentData = {
      shippedAt: fulfillment.created_at ? new Date(fulfillment.created_at) : FieldValue.serverTimestamp(),
      trackingNumber: fulfillment.tracking_number || null,
      trackingCompany: fulfillment.tracking_company || null,
      trackingUrl: fulfillment.tracking_url || null,
      status: fulfillment.status || 'success',
    };

    await orderDoc.ref.update({
      fulfillment: fulfillmentData,
      status: 'shipped', // Update order status to shipped
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    console.log(`Updated fulfillment for order: ${orderDoc.id} (Shopify order ${orderId})`);
    return orderDoc.id;
  } else {
    console.log(`Order ${orderId} not found in Firestore`);
    return null;
  }
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
    const fulfillment = payload;
    
    // Fulfillment payload contains order_id
    const orderId = fulfillment.order_id;

    console.log(`Received fulfillment creation webhook: fulfillment_id=${fulfillment.id}, order_id=${orderId}`);

    const db = getAdminDb();
    const firestoreOrderId = await updateOrderFulfillment(db, fulfillment, orderId);

    return NextResponse.json({ 
      ok: true, 
      fulfillmentId: fulfillment.id,
      shopifyOrderId: orderId,
      orderId: firestoreOrderId,
      trackingNumber: fulfillment.tracking_number || null,
    });
  } catch (error) {
    console.error('Fulfillment creation webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Shopify fulfillment creation webhook endpoint is active' });
}

