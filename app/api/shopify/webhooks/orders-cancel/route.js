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
 * Handle order cancellation - update status and optionally restore inventory
 */
async function handleOrderCancellation(db, shopifyOrder) {
  const ordersCollection = db.collection('orders');
  
  const existingOrderSnapshot = await ordersCollection
    .where('shopifyOrderId', '==', shopifyOrder.id.toString())
    .limit(1)
    .get();

  if (!existingOrderSnapshot.empty) {
    const orderDoc = existingOrderSnapshot.docs[0];
    const orderData = orderDoc.data();
    
    // Update order status to cancelled
    await orderDoc.ref.update({
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    console.log(`Cancelled order: ${orderDoc.id} (Shopify order ${shopifyOrder.id})`);
    
    // Optionally restore inventory for cancelled items
    // This would require matching variants back to products and incrementing stock
    // For now, we'll just log that inventory should be restored
    if (orderData.items && orderData.items.length > 0) {
      console.log(`Order ${orderDoc.id} had ${orderData.items.length} items - inventory restoration may be needed`);
    }
    
    return orderDoc.id;
  } else {
    console.log(`Order ${shopifyOrder.id} not found in Firestore - may have been cancelled before sync`);
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
    const shopifyOrder = payload;

    console.log(`Received order cancellation webhook: order_id=${shopifyOrder.id}`);

    const db = getAdminDb();
    const orderId = await handleOrderCancellation(db, shopifyOrder);

    return NextResponse.json({ 
      ok: true, 
      shopifyOrderId: shopifyOrder.id,
      orderId,
      message: orderId ? 'Order marked as cancelled' : 'Order not found',
    });
  } catch (error) {
    console.error('Order cancellation webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Shopify order cancellation webhook endpoint is active' });
}

