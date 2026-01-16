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
  )?.value || 'FIVESTARFINDS'; // Default to FIVESTARFINDS if not found

  // Extract market from note_attributes (set via customAttributes in checkoutCreate)
  // Support both old format (storefront_market) and new format (_market)
  const marketFromAttributes = shopifyOrder.note_attributes?.find(
    (attr) => attr.name === '_market' || attr.name === 'storefront_market'
  )?.value;
  const marketFromCountry = shopifyOrder.shipping_address?.country_code?.toUpperCase();
  const market = marketFromAttributes || marketFromCountry || 'DE'; // Default to DE if not found
  
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
    confirmationNumber: shopifyOrder.confirmation_number || shopifyOrder.name || null, // Used for thank-you page lookup
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
  try {
    // Extract storefront from note_attributes
    // Support both old format (storefront) and new format (_storefront)
    const noteAttributes = shopifyOrder.note_attributes || [];
    console.log(`[Order Webhook] Note attributes:`, JSON.stringify(noteAttributes));
    
    const storefrontAttr = noteAttributes.find(
      (attr) => attr.name === '_storefront' || attr.name === 'storefront'
    );
    const storefront = storefrontAttr?.value || 'LUNERA';
    
    console.log(`[Order Webhook] Extracted storefront: "${storefront}" (from attribute: ${storefrontAttr?.name || 'none'})`);
    console.log(`[Order Webhook] Order ID: ${shopifyOrder.id}, Order Number: ${shopifyOrder.order_number || shopifyOrder.name}`);
    
    // Save to storefront-specific orders collection
    // Path: {storefront}/orders/items/{orderId}
    const collectionPath = `${storefront}/orders/items`;
    console.log(`[Order Webhook] Target Firestore collection path: ${collectionPath}`);
    
    const ordersCollection = db.collection(storefront).doc('orders').collection('items');
    console.log(`[Order Webhook] Collection reference created successfully`);
    
    // Check if order already exists (by Shopify order ID)
    const shopifyOrderId = shopifyOrder.id.toString();
    console.log(`[Order Webhook] Checking for existing order with shopifyOrderId: ${shopifyOrderId}`);
    
    const existingOrderSnapshot = await ordersCollection
      .where('shopifyOrderId', '==', shopifyOrderId)
      .limit(1)
      .get();
    
    console.log(`[Order Webhook] Existing order check complete. Found ${existingOrderSnapshot.empty ? '0' : '1'} existing order(s)`);

    const orderData = transformShopifyOrder(shopifyOrder);
    console.log(`[Order Webhook] Order data transformed. Storefront: ${orderData.storefront}, Market: ${orderData.market}, Status: ${orderData.status}, Items: ${orderData.items?.length || 0}`);
    console.log(`[Order Webhook] Order totals - Subtotal: ${orderData.totals?.subtotal}, Tax: ${orderData.totals?.tax}, Shipping: ${orderData.totals?.shipping}, Grand Total: ${orderData.totals?.grandTotal}`);

    if (!existingOrderSnapshot.empty) {
      // Update existing order
      const orderDoc = existingOrderSnapshot.docs[0];
      const existingOrderId = orderDoc.id;
      console.log(`[Order Webhook] Updating existing order document: ${existingOrderId}`);
      
      // Don't update createdAt, but update everything else
      const { createdAt, ...updateData } = orderData;
      console.log(`[Order Webhook] Update data prepared (excluding createdAt). Fields to update: ${Object.keys(updateData).join(', ')}`);
      
      await orderDoc.ref.update({
        ...updateData,
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      console.log(`[Order Webhook] ✅ Successfully updated order: ${existingOrderId} (Shopify order ${shopifyOrder.id}) in collection: ${collectionPath}`);
      
      // Also update orderConfirmations if confirmation number exists
      if (updateData.confirmationNumber) {
        try {
          const confirmationRef = db.collection('orderConfirmations').doc(updateData.confirmationNumber);
          const confirmationData = {
            orderId: updateData.shopifyOrderId,
            orderNumber: updateData.orderNumber,
            confirmationNumber: updateData.confirmationNumber,
            storefront: updateData.storefront,
            market: updateData.market,
            email: updateData.email,
            total: updateData.totals.grandTotal,
            currency: updateData.currency,
            items: updateData.items.map(item => ({
              title: item.title,
              quantity: item.quantity,
              price: item.unitPrice,
              subtotal: item.subtotal,
            })),
            updatedAt: FieldValue.serverTimestamp(),
          };
          
          await confirmationRef.set(confirmationData, { merge: true });
          console.log(`[Order Webhook] ✅ Updated confirmation data for confirmation number: ${updateData.confirmationNumber}`);
        } catch (confirmationError) {
          console.error(`[Order Webhook] ⚠️  Failed to update confirmation data:`, confirmationError);
          // Don't throw - this is non-critical for order processing
        }
      }
      
      return existingOrderId;
    } else {
      // Create new order
      console.log(`[Order Webhook] Creating new order document in collection: ${collectionPath}`);
      console.log(`[Order Webhook] Order data fields: ${Object.keys(orderData).join(', ')}`);
      
      const orderRef = await ordersCollection.add(orderData);
      const newOrderId = orderRef.id;
      
      console.log(`[Order Webhook] ✅ Successfully created order: ${newOrderId} (Shopify order ${shopifyOrder.id}) in collection: ${collectionPath}`);
      
      // Also store in orderConfirmations collection for fast thank-you page lookup
      if (orderData.confirmationNumber) {
        try {
          const confirmationRef = db.collection('orderConfirmations').doc(orderData.confirmationNumber);
          const confirmationData = {
            orderId: orderData.shopifyOrderId,
            orderNumber: orderData.orderNumber,
            confirmationNumber: orderData.confirmationNumber,
            storefront: orderData.storefront,
            market: orderData.market,
            email: orderData.email,
            customerName: shopifyOrder.customer?.first_name || shopifyOrder.shipping_address?.first_name || '',
            total: orderData.totals.grandTotal,
            currency: orderData.currency,
            items: orderData.items.map(item => ({
              title: item.title,
              quantity: item.quantity,
              price: item.unitPrice,
              subtotal: item.subtotal,
            })),
            createdAt: orderData.placedAt,
            expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days TTL
          };
          
          await confirmationRef.set(confirmationData);
          console.log(`[Order Webhook] ✅ Stored confirmation data for confirmation number: ${orderData.confirmationNumber}`);
        } catch (confirmationError) {
          console.error(`[Order Webhook] ⚠️  Failed to store confirmation data:`, confirmationError);
          // Don't throw - this is non-critical for order processing
        }
      }
      
      return newOrderId;
    }
  } catch (error) {
    console.error(`[Order Webhook] ❌ Error in syncOrderToFirestore for order ${shopifyOrder.id}:`, error);
    console.error(`[Order Webhook] Error name: ${error.name}, message: ${error.message}`);
    console.error(`[Order Webhook] Error stack:`, error.stack);
    console.error(`[Order Webhook] Error code: ${error.code || 'N/A'}`);
    
    // Log context about what we were trying to do
    try {
      const storefront = shopifyOrder.note_attributes?.find(
        (attr) => attr.name === '_storefront' || attr.name === 'storefront'
      )?.value || 'LUNERA';
      console.error(`[Order Webhook] Failed operation context:`, {
        storefront,
        collectionPath: `${storefront}/orders/items`,
        shopifyOrderId: shopifyOrder.id?.toString(),
        orderNumber: shopifyOrder.order_number || shopifyOrder.name,
      });
    } catch (contextError) {
      console.error(`[Order Webhook] Failed to log context:`, contextError);
    }
    
    throw error; // Re-throw to be caught by the main handler
  }
}

export async function POST(request) {
  let shopifyOrderId = 'unknown';
  let orderNumber = 'unknown';
  
  try {
    console.log(`[Order Webhook] ===== Received POST request =====`);
    
    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      console.error('[Order Webhook] ❌ Missing x-shopify-hmac-sha256 header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Order Webhook] HMAC header present, verifying signature...`);

    // Verify webhook signature
    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('[Order Webhook] ❌ Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Order Webhook] ✅ Webhook signature verified`);

    const payload = JSON.parse(rawBody);
    const shopifyOrder = payload;
    
    shopifyOrderId = shopifyOrder.id?.toString() || 'unknown';
    orderNumber = shopifyOrder.order_number?.toString() || shopifyOrder.name || 'unknown';

    console.log(`[Order Webhook] Parsed payload. Order ID: ${shopifyOrderId}, Order Number: ${orderNumber}`);
    console.log(`[Order Webhook] Order email: ${shopifyOrder.email || 'N/A'}, Financial status: ${shopifyOrder.financial_status || 'N/A'}, Fulfillment status: ${shopifyOrder.fulfillment_status || 'N/A'}`);

    const db = getAdminDb();
    console.log(`[Order Webhook] ✅ Firestore admin database instance obtained`);

    // Sync order to Firestore
    console.log(`[Order Webhook] Starting sync to Firestore...`);
    const orderId = await syncOrderToFirestore(db, shopifyOrder);
    console.log(`[Order Webhook] ✅ Sync completed. Firestore order ID: ${orderId}`);

    const response = { 
      ok: true, 
      shopifyOrderId: shopifyOrder.id,
      orderId,
      orderNumber: shopifyOrder.order_number || shopifyOrder.name,
    };
    
    console.log(`[Order Webhook] ===== Successfully processed order webhook =====`);
    return NextResponse.json(response);
    
  } catch (error) {
    console.error(`[Order Webhook] ===== ERROR PROCESSING ORDER WEBHOOK =====`);
    console.error(`[Order Webhook] Order ID: ${shopifyOrderId}, Order Number: ${orderNumber}`);
    console.error(`[Order Webhook] Error type: ${error.constructor.name}`);
    console.error(`[Order Webhook] Error name: ${error.name || 'N/A'}`);
    console.error(`[Order Webhook] Error message: ${error.message || 'N/A'}`);
    console.error(`[Order Webhook] Error code: ${error.code || 'N/A'}`);
    console.error(`[Order Webhook] Error stack:`, error.stack);
    
    // Log additional context if available
    if (error.code) {
      console.error(`[Order Webhook] Firestore error code: ${error.code}`);
      if (error.code === 'permission-denied') {
        console.error(`[Order Webhook] ⚠️  Permission denied - check Firestore security rules`);
      } else if (error.code === 'not-found') {
        console.error(`[Order Webhook] ⚠️  Collection or document not found - check collection path`);
      } else if (error.code === 'invalid-argument') {
        console.error(`[Order Webhook] ⚠️  Invalid argument - check data structure`);
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

// Handle GET requests (for webhook verification during setup)
export async function GET() {
  return NextResponse.json({ message: 'Shopify order creation webhook endpoint is active' });
}

