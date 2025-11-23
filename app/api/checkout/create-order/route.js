import { NextResponse } from 'next/server';
import { createOrder } from '@/lib/shopify-api';
import { getAdminDb } from '@/lib/firestore-server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorefrontFromRequest } from '@/lib/get-storefront-server';

/**
 * Create an order in Shopify and Firestore
 * Called after successful payment
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      cart,
      shippingAddress,
      billingAddress,
      email,
      paymentIntentId, // Stripe payment intent ID
      paymentMethod, // 'stripe', 'manual', etc.
      userId, // Firebase user ID (if authenticated)
      storefront: bodyStorefront, // Storefront name from body
    } = body;
    
    // Extract storefront from request URL or use body parameter
    const storefront = bodyStorefront || getStorefrontFromRequest(request);

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json(
        { error: 'Cart is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!shippingAddress) {
      return NextResponse.json(
        { error: 'Shipping address is required' },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Transform cart items to Shopify line items
    const lineItems = cart.map((item) => {
      if (!item.variantId || !item.quantity || !item.priceAtAdd) {
        throw new Error(`Invalid cart item: ${JSON.stringify(item)}`);
      }

      return {
        variantId: item.variantId, // Shopify variant ID
        quantity: item.quantity,
        price: item.priceAtAdd.toString(),
        title: item.productName || item.title || 'Product',
        sku: item.sku || null,
      };
    });

    // Create order in Shopify
    const shopifyOrder = await createOrder({
      lineItems,
      shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      email,
      financialStatus: 'paid', // Order is paid
      fulfillmentStatus: 'unfulfilled',
      note: `Order placed from ${storefront} storefront. Payment: ${paymentIntentId || 'manual'}`,
      tags: [storefront, 'web-order'],
      transactions: paymentIntentId ? [{
        kind: 'sale',
        status: 'success',
        amount: cart.reduce((sum, item) => sum + (item.priceAtAdd * item.quantity), 0).toString(),
        gateway: paymentMethod || 'stripe',
        transactionId: paymentIntentId,
      }] : [],
    });

    console.log(`Created Shopify order: ${shopifyOrder.id} (Order #${shopifyOrder.order_number || shopifyOrder.name})`);

    // Save order to Firestore (storefront-specific)
    const db = getAdminDb();
    if (!db) {
      throw new Error('Firebase Admin DB not available');
    }

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (item.priceAtAdd * item.quantity), 0);
    const tax = 0; // Tax calculated by Shopify
    const shipping = 0; // Shipping calculated by Shopify
    const grandTotal = parseFloat(shopifyOrder.total_price || subtotal);

    const orderData = {
      shopifyOrderId: shopifyOrder.id.toString(),
      orderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name || null,
      userId: userId || null,
      email: email,
      storefront: storefront,
      status: 'paid', // Order is paid
      items: cart.map((item) => ({
        productId: item.productId || null,
        variantId: item.variantId || null,
        quantity: item.quantity || 0,
        unitPrice: item.priceAtAdd || 0,
        subtotal: (item.priceAtAdd || 0) * (item.quantity || 0),
        title: item.productName || item.title || 'Product',
        sku: item.sku || null,
        image: item.image || null,
      })),
      totals: {
        subtotal,
        discounts: 0,
        tax,
        shipping,
        grandTotal,
      },
      shippingAddress: {
        firstName: shippingAddress.firstName || '',
        lastName: shippingAddress.lastName || '',
        address1: shippingAddress.address1 || '',
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city || '',
        province: shippingAddress.province || '',
        zip: shippingAddress.zip || '',
        country: shippingAddress.country || 'US',
        phone: shippingAddress.phone || '',
      },
      billingAddress: billingAddress ? {
        firstName: billingAddress.firstName || '',
        lastName: billingAddress.lastName || '',
        address1: billingAddress.address1 || '',
        address2: billingAddress.address2 || '',
        city: billingAddress.city || '',
        province: billingAddress.province || '',
        zip: billingAddress.zip || '',
        country: billingAddress.country || 'US',
        phone: billingAddress.phone || '',
      } : null,
      paymentSummary: {
        method: paymentMethod || 'stripe',
        transactionId: paymentIntentId || null,
        status: 'paid',
      },
      fulfillment: null, // Will be updated via webhook
      placedAt: FieldValue.serverTimestamp(),
      currency: shopifyOrder.currency || 'USD',
      note: shopifyOrder.note || null,
      tags: shopifyOrder.tags ? shopifyOrder.tags.split(', ').map(t => t.trim()) : [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Save to storefront-specific orders collection
    // Path: {storefront}/orders/items/{orderId}
    const ordersRef = db.collection(storefront).collection('orders').collection('items');
    const orderRef = await ordersRef.add(orderData);

    console.log(`Saved order to Firestore: ${orderRef.id} (Shopify order ${shopifyOrder.id})`);

    return NextResponse.json({
      ok: true,
      orderId: orderRef.id,
      shopifyOrderId: shopifyOrder.id.toString(),
      orderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
      shopifyOrderName: shopifyOrder.name,
    });
  } catch (error) {
    console.error('Failed to create order:', error);
    return NextResponse.json(
      { error: 'Failed to create order', message: error.message },
      { status: 500 }
    );
  }
}

