import { NextResponse } from 'next/server';
import { validateCheckout } from '@/lib/shopify-shipping';

/**
 * Validate checkout before order placement
 * Checks:
 * 1. Inventory availability for all cart items
 * 2. Shipping availability to the destination address
 * 3. Calculates real shipping rates
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { cart, shippingAddress } = body;

    console.log('[Validate API] Received request:', {
      cartItems: cart?.length || 0,
      cart: cart?.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        shopifyVariantId: item.shopifyVariantId,
        quantity: item.quantity,
      })),
      shippingAddress: shippingAddress ? {
        address1: shippingAddress.address1,
        city: shippingAddress.city,
        zip: shippingAddress.zip,
        country: shippingAddress.country,
      } : null,
    });

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      console.error('[Validate API] Cart is empty or invalid');
      return NextResponse.json(
        { error: 'Cart is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!shippingAddress) {
      console.error('[Validate API] Shipping address is missing');
      return NextResponse.json(
        { error: 'Shipping address is required' },
        { status: 400 }
      );
    }

    // Validate that at least country and city are provided
    if (!shippingAddress.countryCode && !shippingAddress.country) {
      console.error('[Validate API] Country is missing');
      return NextResponse.json(
        { error: 'Country is required for shipping validation' },
        { status: 400 }
      );
    }

    if (!shippingAddress.city) {
      console.error('[Validate API] City is missing');
      return NextResponse.json(
        { error: 'City is required for shipping validation' },
        { status: 400 }
      );
    }

    // Check if cart items have shopifyVariantId
    const missingShopifyIds = cart.filter(item => !item.shopifyVariantId);
    if (missingShopifyIds.length > 0) {
      console.warn('[Validate API] Some cart items missing shopifyVariantId:', missingShopifyIds.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
      })));
      
      // If items are missing shopifyVariantId, we need to resolve them from Firestore
      console.log('[Validate API] Attempting to resolve missing shopifyVariantIds from Firestore...');
      // Note: This would require fetching from Firestore, which we'll handle in validateCheckout
    }

    console.log('[Validate API] Calling validateCheckout...');
    // Validate checkout (inventory + shipping)
    const validation = await validateCheckout({ cart, shippingAddress });
    console.log('[Validate API] Validation complete:', {
      valid: validation.valid,
      shippingAvailable: validation.shipping?.available,
      shippingRatesCount: validation.shipping?.rates?.length || 0,
      inventoryValid: validation.inventory?.valid,
    });

    return NextResponse.json(validation);
  } catch (error) {
    console.error('Checkout validation error:', error);
    return NextResponse.json(
      {
        valid: false,
        error: error.message || 'Validation failed',
        errors: [error.message || 'Validation failed'],
      },
      { status: 500 }
    );
  }
}

