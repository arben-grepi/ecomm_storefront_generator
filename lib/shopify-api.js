/**
 * Shopify Admin API client
 * Handles creating orders, fetching product data, etc.
 * 
 * Note: This runs server-side only (in API routes)
 */

const SHOPIFY_API_VERSION = '2025-10';

function getShopifyCredentials() {
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Missing Shopify credentials. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.');
  }
  
  return { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN };
}

/**
 * Make a request to Shopify Admin API
 */
async function shopifyRequest(endpoint, options = {}) {
  const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN } = getShopifyCredentials();

  const url = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return response.json();
}

/**
 * Create a draft order in Shopify
 * Draft orders can be converted to orders after payment
 */
export async function createDraftOrder(orderData) {
  const {
    lineItems,
    shippingAddress,
    billingAddress,
    email,
    note,
    tags = [],
  } = orderData;

  const draftOrder = {
    line_items: lineItems.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      price: item.price,
      title: item.title,
      ...(item.sku ? { sku: item.sku } : {}),
    })),
    shipping_address: shippingAddress ? {
      first_name: shippingAddress.firstName || '',
      last_name: shippingAddress.lastName || '',
      address1: shippingAddress.address1 || '',
      address2: shippingAddress.address2 || '',
      city: shippingAddress.city || '',
      province: shippingAddress.province || '',
      zip: shippingAddress.zip || '',
      country: shippingAddress.country || 'US',
      phone: shippingAddress.phone || '',
    } : undefined,
    billing_address: billingAddress ? {
      first_name: billingAddress.firstName || '',
      last_name: billingAddress.lastName || '',
      address1: billingAddress.address1 || '',
      address2: billingAddress.address2 || '',
      city: billingAddress.city || '',
      province: billingAddress.province || '',
      zip: billingAddress.zip || '',
      country: billingAddress.country || 'US',
      phone: billingAddress.phone || '',
    } : undefined,
    email: email || undefined,
    note: note || undefined,
    tags: tags.join(', '),
    use_customer_default_address: false,
  };

  const response = await shopifyRequest('/draft_orders.json', {
    method: 'POST',
    body: JSON.stringify({ draft_order: draftOrder }),
  });

  return response.draft_order;
}

/**
 * Complete a draft order (convert to order after payment)
 */
export async function completeDraftOrder(draftOrderId, paymentGateway) {
  const response = await shopifyRequest(`/draft_orders/${draftOrderId}/complete.json`, {
    method: 'PUT',
    body: JSON.stringify({
      draft_order: {
        payment_gateway: paymentGateway || 'manual', // 'manual', 'stripe', etc.
      },
    }),
  });

  return response.draft_order;
}

/**
 * Create an order directly in Shopify (for paid orders)
 */
export async function createOrder(orderData) {
  const {
    lineItems,
    shippingAddress,
    billingAddress,
    email,
    financialStatus = 'paid', // 'pending', 'paid', 'authorized', etc.
    fulfillmentStatus = 'unfulfilled',
    note,
    tags = [],
    transactions = [], // Payment transactions
  } = orderData;

  const order = {
    line_items: lineItems.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      price: item.price,
      title: item.title,
      ...(item.sku ? { sku: item.sku } : {}),
    })),
    shipping_address: shippingAddress ? {
      first_name: shippingAddress.firstName || '',
      last_name: shippingAddress.lastName || '',
      address1: shippingAddress.address1 || '',
      address2: shippingAddress.address2 || '',
      city: shippingAddress.city || '',
      province: shippingAddress.province || '',
      zip: shippingAddress.zip || '',
      country: shippingAddress.country || 'US',
      phone: shippingAddress.phone || '',
    } : undefined,
    billing_address: billingAddress ? {
      first_name: billingAddress.firstName || '',
      last_name: billingAddress.lastName || '',
      address1: billingAddress.address1 || '',
      address2: billingAddress.address2 || '',
      city: billingAddress.city || '',
      province: billingAddress.province || '',
      zip: billingAddress.zip || '',
      country: billingAddress.country || 'US',
      phone: billingAddress.phone || '',
    } : undefined,
    email: email || undefined,
    financial_status: financialStatus,
    fulfillment_status: fulfillmentStatus,
    note: note || undefined,
    tags: tags.join(', '),
    ...(transactions.length > 0 ? {
      transactions: transactions.map((tx) => ({
        kind: tx.kind || 'sale', // 'sale', 'authorization', 'capture', etc.
        status: tx.status || 'success',
        amount: tx.amount,
        gateway: tx.gateway || 'manual',
        ...(tx.transactionId ? { id: tx.transactionId } : {}),
      })),
    } : {}),
  };

  const response = await shopifyRequest('/orders.json', {
    method: 'POST',
    body: JSON.stringify({ order }),
  });

  return response.order;
}

/**
 * Get order by Shopify order ID
 */
export async function getOrder(shopifyOrderId) {
  const response = await shopifyRequest(`/orders/${shopifyOrderId}.json`);
  return response.order;
}

/**
 * Get order by Shopify order number (for fallback queries)
 */
export async function getOrderByNumber(orderNumber) {
  const response = await shopifyRequest(`/orders.json?name=${orderNumber}&limit=1`);
  return response.orders?.[0] || null;
}

