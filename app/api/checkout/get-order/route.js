import { NextResponse } from 'next/server';
import { getOrder } from '@/lib/shopify-api';
import { getShopifyUserMessage, isShopifyUnavailableError } from '@/lib/shopify-errors';

/**
 * Get order from Shopify Admin API (fallback for order confirmation page)
 * Used when webhook hasn't synced order to Firestore yet
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required', message: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Fetch order from Shopify Admin API
    const order = await getOrder(orderId);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found', message: 'Order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Failed to fetch order from Shopify:', error);
    return NextResponse.json(
      {
        error: isShopifyUnavailableError(error) ? 'shopify_unavailable' : 'Failed to fetch order',
        message: getShopifyUserMessage(error, 'Failed to fetch order. Please try again later.'),
      },
      { status: isShopifyUnavailableError(error) ? 503 : 500 }
    );
  }
}


