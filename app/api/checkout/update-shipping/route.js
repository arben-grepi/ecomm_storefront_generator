import { NextResponse } from 'next/server';
import { updateCartBuyerIdentity } from '@/lib/shopify-storefront-api';

/**
 * @deprecated Shipping selection happens on Shopify's hosted checkout page
 * This endpoint is kept for backward compatibility but shipping rates are NOT available via Cart API
 * 
 * With Cart API, customers select shipping options on Shopify's checkout page, not in our app
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { cartId, shippingAddress, market } = body;

    // If this is called with old checkoutId format, return error
    if (body.checkoutId && !cartId) {
      return NextResponse.json(
        { 
          error: 'Shipping selection not available via Cart API',
          message: 'Shipping options are selected on Shopify\'s hosted checkout page. Please redirect to checkout URL and select shipping there.',
          deprecated: true,
        },
        { status: 400 }
      );
    }

    // If cartId and shippingAddress provided, update cart buyer identity
    if (cartId && shippingAddress) {
      const updatedCart = await updateCartBuyerIdentity(cartId, shippingAddress, market || 'FI');
      
      return NextResponse.json({
        ok: true,
        cartId: cartId,
        checkoutUrl: updatedCart.checkoutUrl,
        message: 'Cart buyer identity updated. Shipping selection happens on checkout page.',
      });
    }

    return NextResponse.json(
      { 
        error: 'Shipping selection not available via Cart API',
        message: 'Shipping options are selected on Shopify\'s hosted checkout page',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to update shipping:', error);
    return NextResponse.json(
      {
        error: 'Failed to update shipping',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

