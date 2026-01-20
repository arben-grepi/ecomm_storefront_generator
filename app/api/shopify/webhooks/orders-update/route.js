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
 * Transform Shopify order to Firestore order format (same as orders-create)
 */
function transformShopifyOrder(shopifyOrder) {
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

  const items = (shopifyOrder.line_items || []).map((item) => ({
    productId: item.product_id ? item.product_id.toString() : null,
    variantId: item.variant_id ? item.variant_id.toString() : null,
    quantity: item.quantity || 0,
    unitPrice: parseFloat(item.price || 0),
    subtotal: parseFloat(item.price || 0) * (item.quantity || 0),
    title: item.title || '',
    sku: item.sku || null,
  }));

  const subtotal = parseFloat(shopifyOrder.subtotal_price || 0);
  const tax = parseFloat(shopifyOrder.total_tax || 0);
  const shipping = parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || 
                              shopifyOrder.shipping_lines?.reduce((sum, line) => sum + parseFloat(line.price || 0), 0) || 0);
  const discounts = parseFloat(shopifyOrder.total_discounts || 0);
  const grandTotal = parseFloat(shopifyOrder.total_price || 0);

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

  const paymentSummary = {
    provider: shopifyOrder.gateway || 'unknown',
    transactionId: shopifyOrder.transactions?.[0]?.id?.toString() || shopifyOrder.order_number?.toString() || null,
    last4: shopifyOrder.payment_gateway_names?.[0] || null,
  };

  const fulfillment = shopifyOrder.fulfillments && shopifyOrder.fulfillments.length > 0 ? {
    shippedAt: shopifyOrder.fulfillments[0].created_at ? 
                new Date(shopifyOrder.fulfillments[0].created_at) : null,
    trackingNumber: shopifyOrder.fulfillments[0].tracking_number || null,
    trackingCompany: shopifyOrder.fulfillments[0].tracking_company || null,
    trackingUrl: shopifyOrder.fulfillments[0].tracking_url || null,
  } : null;

  // Extract market from note_attributes (set via customAttributes in checkoutCreate)
  const marketFromAttributes = shopifyOrder.note_attributes?.find(
    (attr) => attr.name === '_market' || attr.name === 'storefront_market'
  )?.value;
  const marketFromCountry = shopifyOrder.shipping_address?.country_code?.toUpperCase();
  const market = marketFromAttributes || marketFromCountry || 'DE'; // Default to DE if not found
  
  console.log(`[Order Webhook] Updating order ${shopifyOrder.id} - Market: ${market} (from attributes: ${marketFromAttributes || 'none'}, from country: ${marketFromCountry || 'none'})`);

  return {
    shopifyOrderId: shopifyOrder.id.toString(),
    orderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name || null,
    userId: null,
    email: shopifyOrder.email || null,
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
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Update order in Firestore
 */
async function updateOrderInFirestore(db, shopifyOrder) {
  try {
    // Extract storefront from note_attributes
    // Support both old format (storefront) and new format (_storefront)
    const noteAttributes = shopifyOrder.note_attributes || [];
    console.log(`[Order Update Webhook] Note attributes:`, JSON.stringify(noteAttributes));
    
    const storefrontAttr = noteAttributes.find(
      (attr) => attr.name === '_storefront' || attr.name === 'storefront'
    );
    const storefront = storefrontAttr?.value || 'FIVESTARFINDS';
    
    console.log(`[Order Update Webhook] Extracted storefront: "${storefront}" (from attribute: ${storefrontAttr?.name || 'none'})`);
    console.log(`[Order Update Webhook] Order ID: ${shopifyOrder.id}, Order Number: ${shopifyOrder.order_number || shopifyOrder.name}`);

    // Extract market from note_attributes (set via customAttributes in checkoutCreate)
    const marketFromAttributes = noteAttributes.find(
      (attr) => attr.name === '_market' || attr.name === 'storefront_market'
    )?.value;
    const marketFromCountry = shopifyOrder.shipping_address?.country_code?.toUpperCase();
    const market = marketFromAttributes || marketFromCountry || 'DE'; // Default to DE if not found
    
    console.log(`[Order Update Webhook] Extracted market: "${market}" (from attributes: ${marketFromAttributes || 'none'}, from country: ${marketFromCountry || 'none'})`);
    
    // Save to storefront-specific orders collection
    // Path: {storefront}/orders/items/{orderId}
    const collectionPath = `${storefront}/orders/items`;
    console.log(`[Order Update Webhook] Target Firestore collection path: ${collectionPath}`);
    
    const ordersCollection = db.collection(storefront).doc('orders').collection('items');
    console.log(`[Order Update Webhook] Collection reference created successfully`);
    
    const shopifyOrderId = shopifyOrder.id.toString();
    console.log(`[Order Update Webhook] Checking for existing order with shopifyOrderId: ${shopifyOrderId}`);
    
    const existingOrderSnapshot = await ordersCollection
      .where('shopifyOrderId', '==', shopifyOrderId)
      .limit(1)
      .get();
    
    console.log(`[Order Update Webhook] Existing order check complete. Found ${existingOrderSnapshot.empty ? '0' : '1'} existing order(s)`);

    const orderData = transformShopifyOrder(shopifyOrder);
    
    // Add market and storefront to order data
    orderData.market = market;
    orderData.storefront = storefront;
    
    console.log(`[Order Update Webhook] Order data transformed. Storefront: ${orderData.storefront}, Market: ${orderData.market}, Status: ${orderData.status}, Items: ${orderData.items?.length || 0}`);
    console.log(`[Order Update Webhook] Order totals - Subtotal: ${orderData.totals?.subtotal}, Tax: ${orderData.totals?.tax}, Shipping: ${orderData.totals?.shipping}, Grand Total: ${orderData.totals?.grandTotal}`);

    if (!existingOrderSnapshot.empty) {
      const orderDoc = existingOrderSnapshot.docs[0];
      const existingOrderId = orderDoc.id;
      console.log(`[Order Update Webhook] Updating existing order document: ${existingOrderId}`);
      
      // Preserve createdAt, but update everything else
      const { createdAt, placedAt, ...updateData } = orderData;
      console.log(`[Order Update Webhook] Update data prepared (excluding createdAt, preserving placedAt). Fields to update: ${Object.keys(updateData).join(', ')}`);
      
      await orderDoc.ref.update({
        ...updateData,
        placedAt: orderData.placedAt, // Keep original placedAt
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      console.log(`[Order Update Webhook] ✅ Successfully updated order: ${existingOrderId} (Shopify order ${shopifyOrder.id}) in collection: ${collectionPath}`);
      return existingOrderId;
    } else {
      // Order doesn't exist, create it (shouldn't happen, but handle gracefully)
      console.log(`[Order Update Webhook] ⚠️  Order not found, creating new order document in collection: ${collectionPath}`);
      console.log(`[Order Update Webhook] Order data fields: ${Object.keys(orderData).join(', ')}`);
      
      const orderRef = await ordersCollection.add({
        ...orderData,
        market: market, // Ensure market is included
        storefront: storefront, // Ensure storefront is included
        createdAt: FieldValue.serverTimestamp(),
      });
      const newOrderId = orderRef.id;
      
      console.log(`[Order Update Webhook] ✅ Created missing order: ${newOrderId} (Shopify order ${shopifyOrder.id}) in collection: ${collectionPath}`);
      return newOrderId;
    }
  } catch (error) {
    console.error(`[Order Update Webhook] ❌ Error in updateOrderInFirestore for order ${shopifyOrder.id}:`, error);
    console.error(`[Order Update Webhook] Error name: ${error.name}, message: ${error.message}`);
    console.error(`[Order Update Webhook] Error stack:`, error.stack);
    console.error(`[Order Update Webhook] Error code: ${error.code || 'N/A'}`);
    
    // Log context about what we were trying to do
    try {
      const storefront = shopifyOrder.note_attributes?.find(
        (attr) => attr.name === '_storefront' || attr.name === 'storefront'
      )?.value || 'FIVESTARFINDS';
      console.error(`[Order Update Webhook] Failed operation context:`, {
        storefront,
        collectionPath: `${storefront}/orders/items`,
        shopifyOrderId: shopifyOrder.id?.toString(),
        orderNumber: shopifyOrder.order_number || shopifyOrder.name,
      });
    } catch (contextError) {
      console.error(`[Order Update Webhook] Failed to log context:`, contextError);
    }
    
    throw error; // Re-throw to be caught by the main handler
  }
}

export async function POST(request) {
  let shopifyOrderId = 'unknown';
  let orderNumber = 'unknown';
  
  try {
    console.log(`[Order Update Webhook] ===== Received POST request =====`);
    
    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      console.error('[Order Update Webhook] ❌ Missing x-shopify-hmac-sha256 header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Order Update Webhook] HMAC header present, verifying signature...`);

    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('[Order Update Webhook] ❌ Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Order Update Webhook] ✅ Webhook signature verified`);

    const payload = JSON.parse(rawBody);
    const shopifyOrder = payload;
    
    shopifyOrderId = shopifyOrder.id?.toString() || 'unknown';
    orderNumber = shopifyOrder.order_number?.toString() || shopifyOrder.name || 'unknown';

    console.log(`[Order Update Webhook] Parsed payload. Order ID: ${shopifyOrderId}, Order Number: ${orderNumber}`);
    console.log(`[Order Update Webhook] Order email: ${shopifyOrder.email || 'N/A'}, Financial status: ${shopifyOrder.financial_status || 'N/A'}, Fulfillment status: ${shopifyOrder.fulfillment_status || 'N/A'}`);

    const db = getAdminDb();
    console.log(`[Order Update Webhook] ✅ Firestore admin database instance obtained`);

    console.log(`[Order Update Webhook] Starting update in Firestore...`);
    const orderId = await updateOrderInFirestore(db, shopifyOrder);
    console.log(`[Order Update Webhook] ✅ Update completed. Firestore order ID: ${orderId}`);

    const response = { 
      ok: true, 
      shopifyOrderId: shopifyOrder.id,
      orderId,
      orderNumber: shopifyOrder.order_number || shopifyOrder.name,
    };
    
    console.log(`[Order Update Webhook] ===== Successfully processed order update webhook =====`);
    return NextResponse.json(response);
    
  } catch (error) {
    console.error(`[Order Update Webhook] ===== ERROR PROCESSING ORDER UPDATE WEBHOOK =====`);
    console.error(`[Order Update Webhook] Order ID: ${shopifyOrderId}, Order Number: ${orderNumber}`);
    console.error(`[Order Update Webhook] Error type: ${error.constructor.name}`);
    console.error(`[Order Update Webhook] Error name: ${error.name || 'N/A'}`);
    console.error(`[Order Update Webhook] Error message: ${error.message || 'N/A'}`);
    console.error(`[Order Update Webhook] Error code: ${error.code || 'N/A'}`);
    console.error(`[Order Update Webhook] Error stack:`, error.stack);
    
    // Log additional context if available
    if (error.code) {
      console.error(`[Order Update Webhook] Firestore error code: ${error.code}`);
      if (error.code === 'permission-denied') {
        console.error(`[Order Update Webhook] ⚠️  Permission denied - check Firestore security rules`);
      } else if (error.code === 'not-found') {
        console.error(`[Order Update Webhook] ⚠️  Collection or document not found - check collection path`);
      } else if (error.code === 'invalid-argument') {
        console.error(`[Order Update Webhook] ⚠️  Invalid argument - check data structure`);
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error.message,
        code: error.code || 'unknown',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Shopify order update webhook endpoint is active' });
}

