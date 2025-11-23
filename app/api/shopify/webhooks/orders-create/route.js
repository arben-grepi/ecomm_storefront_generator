import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
function getAdminDb() {
  if (getApps().length > 0) {
    return getFirestore();
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    throw new Error('Firebase Admin credentials not configured');
  }

  return getFirestore();
}

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
 * Transform Shopify order to Firestore order format
 */
function transformShopifyOrder(shopifyOrder) {
  // Map Shopify order status to our status
  const statusMap = {
    'pending': 'pending',
    'authorized': 'paid',
    'paid': 'paid',
    'partially_paid': 'paid',
    'partially_refunded': 'paid',
    'refunded': 'cancelled',
    'voided': 'cancelled',
    'cancelled': 'cancelled',
    'fulfilled': 'shipped',
    'partially_fulfilled': 'shipped',
  };

  const orderStatus = statusMap[shopifyOrder.financial_status] || 
                      statusMap[shopifyOrder.fulfillment_status] || 
                      'pending';

  // Extract storefront from note_attributes (set via customAttributes in checkoutCreate)
  // Support both old format (storefront) and new format (_storefront)
  const storefront = shopifyOrder.note_attributes?.find(
    (attr) => attr.name === '_storefront' || attr.name === 'storefront'
  )?.value || 'LUNERA'; // Default to LUNERA if not found

  // Extract market from note_attributes (set via customAttributes in checkoutCreate)
  // Support both old format (storefront_market) and new format (_market)
  const marketFromAttributes = shopifyOrder.note_attributes?.find(
    (attr) => attr.name === '_market' || attr.name === 'storefront_market'
  )?.value;
  const marketFromCountry = shopifyOrder.shipping_address?.country_code?.toUpperCase();
  const market = marketFromAttributes || marketFromCountry || 'FI'; // Default to FI if not found
  
  console.log(`[Order Webhook] Order ${shopifyOrder.id} (${shopifyOrder.order_number || shopifyOrder.name}) - Storefront: ${storefront}, Market: ${market} (from attributes: ${marketFromAttributes || 'none'}, from country: ${marketFromCountry || 'none'})`);

  // Transform line items
  const items = (shopifyOrder.line_items || []).map((item) => ({
    productId: item.product_id ? item.product_id.toString() : null,
    variantId: item.variant_id ? item.variant_id.toString() : null,
    quantity: item.quantity || 0,
    unitPrice: parseFloat(item.price || 0),
    subtotal: parseFloat(item.price || 0) * (item.quantity || 0),
    title: item.title || '',
    sku: item.sku || null,
  }));

  // Calculate totals
  const subtotal = parseFloat(shopifyOrder.subtotal_price || 0);
  const tax = parseFloat(shopifyOrder.total_tax || 0);
  const shipping = parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || 
                              shopifyOrder.shipping_lines?.reduce((sum, line) => sum + parseFloat(line.price || 0), 0) || 0);
  const discounts = parseFloat(shopifyOrder.total_discounts || 0);
  const grandTotal = parseFloat(shopifyOrder.total_price || 0);

  // Transform shipping address
  const shippingAddress = shopifyOrder.shipping_address ? {
    name: `${shopifyOrder.shipping_address.first_name || ''} ${shopifyOrder.shipping_address.last_name || ''}`.trim(),
    address1: shopifyOrder.shipping_address.address1 || '',
    address2: shopifyOrder.shipping_address.address2 || null,
    city: shopifyOrder.shipping_address.city || '',
    state: shopifyOrder.shipping_address.province || '',
    zip: shopifyOrder.shipping_address.zip || '',
    country: shopifyOrder.shipping_address.country || '',
    phone: shopifyOrder.shipping_address.phone || null,
  } : null;

  // Transform payment info
  const paymentSummary = {
    provider: shopifyOrder.gateway || 'unknown',
    transactionId: shopifyOrder.transactions?.[0]?.id?.toString() || shopifyOrder.order_number?.toString() || null,
    last4: shopifyOrder.payment_gateway_names?.[0] || null,
  };

  // Transform fulfillment info
  const fulfillment = shopifyOrder.fulfillments && shopifyOrder.fulfillments.length > 0 ? {
    shippedAt: shopifyOrder.fulfillments[0].created_at ? 
                new Date(shopifyOrder.fulfillments[0].created_at) : null,
    trackingNumber: shopifyOrder.fulfillments[0].tracking_number || null,
    trackingCompany: shopifyOrder.fulfillments[0].tracking_company || null,
    trackingUrl: shopifyOrder.fulfillments[0].tracking_url || null,
  } : null;

  return {
    shopifyOrderId: shopifyOrder.id.toString(),
    orderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name || null,
    userId: null, // Shopify orders don't have Firebase user IDs - would need to match by email
    email: shopifyOrder.email || null,
    storefront: storefront, // Extract from note_attributes
    market: market, // Extract from note_attributes or shipping address country
    status: orderStatus,
    items,
    totals: {
      subtotal,
      discounts,
      tax,
      shipping,
      grandTotal,
    },
    shippingAddress,
    paymentSummary,
    fulfillment,
    placedAt: shopifyOrder.created_at ? new Date(shopifyOrder.created_at) : FieldValue.serverTimestamp(),
    currency: shopifyOrder.currency || 'USD',
    note: shopifyOrder.note || null,
    tags: shopifyOrder.tags || [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Create or update order in Firestore
 */
async function syncOrderToFirestore(db, shopifyOrder) {
  // Extract storefront from note_attributes
  const storefront = shopifyOrder.note_attributes?.find(
    (attr) => attr.name === 'storefront'
  )?.value || 'LUNERA';
  
  // Save to storefront-specific orders collection
  // Path: {storefront}/orders/items/{orderId}
  const ordersCollection = db.collection(storefront).collection('orders').collection('items');
  
  // Check if order already exists (by Shopify order ID)
  const existingOrderSnapshot = await ordersCollection
    .where('shopifyOrderId', '==', shopifyOrder.id.toString())
    .limit(1)
    .get();

  const orderData = transformShopifyOrder(shopifyOrder);

  if (!existingOrderSnapshot.empty) {
    // Update existing order
    const orderDoc = existingOrderSnapshot.docs[0];
    // Don't update createdAt, but update everything else
    const { createdAt, ...updateData } = orderData;
    await orderDoc.ref.update({
      ...updateData,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`Updated order: ${orderDoc.id} (Shopify order ${shopifyOrder.id})`);
    return orderDoc.id;
  } else {
    // Create new order
    const orderRef = await ordersCollection.add(orderData);
    console.log(`Created order in Firestore: ${orderRef.id} (Shopify order ${shopifyOrder.id}) for storefront: ${storefront}`);
    return orderRef.id;
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

    // Verify webhook signature
    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const shopifyOrder = payload;

    console.log(`Received order creation webhook: order_id=${shopifyOrder.id}, order_number=${shopifyOrder.order_number || shopifyOrder.name}`);

    const db = getAdminDb();

    // Sync order to Firestore
    const orderId = await syncOrderToFirestore(db, shopifyOrder);

    return NextResponse.json({ 
      ok: true, 
      shopifyOrderId: shopifyOrder.id,
      orderId,
      orderNumber: shopifyOrder.order_number || shopifyOrder.name,
    });
  } catch (error) {
    console.error('Order creation webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification during setup)
export async function GET() {
  return NextResponse.json({ message: 'Shopify order creation webhook endpoint is active' });
}

