import { NextResponse } from 'next/server';
import { validateCheckout } from '@/lib/shopify-shipping';
import { getAdminDb } from '@/lib/firestore-server';
import { getCollectionPath } from '@/lib/store-collections';

/**
 * Validate checkout before order placement
 * Checks:
 * 1. Product market availability (products must be available in selected market)
 * 2. Inventory availability for all cart items
 * 3. Shipping availability to the destination address
 * 4. Calculates real shipping rates
 */
export async function POST(request) {
  const apiStartTime = Date.now();
  console.log(`[API] ✅ POST /api/checkout/validate: Request received`);
  
  try {
    const body = await request.json();
    const { cart, shippingAddress: bodyShippingAddress, storefront } = body;

    // Shipping address is optional - if not provided, we can still validate market and inventory
    // Shipping validation will fail if no country is provided, but that's okay
    const shippingAddress = bodyShippingAddress || {};

    console.log(`[API] 📦 Validation request - Cart items: ${cart?.length || 0}, Country: ${shippingAddress?.countryCode || shippingAddress?.country || 'N/A'}, Storefront: ${storefront || 'N/A'}`);
    console.log(`[API] 📋 Cart details:`, cart?.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      shopifyVariantId: item.shopifyVariantId,
      quantity: item.quantity,
      storefront: item.storefront,
    })));

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      console.error(`[API] ❌ Invalid request: Cart is empty or missing`);
      return NextResponse.json(
        {
          valid: false,
          error: 'Cart is required and must not be empty',
          errors: ['Cart is required and must not be empty'],
        },
        { status: 400 }
      );
    }

    // Country is optional for validation - if not provided, we use default market
    // Shipping validation will fail without country, but market/inventory can still be checked

    const validateStartTime = Date.now();
    console.log(`[API] 🔍 Calling validateCheckout (market + inventory + shipping)...`);
    // Validate checkout (market availability + inventory + shipping)
    // All validations are now in one place for simplicity
    const validation = await validateCheckout({ cart, shippingAddress, storefront: storefront || null });
    const validateDuration = Date.now() - validateStartTime;
    
    console.log(`[API] ✅ Validation complete (${validateDuration}ms):`, {
      valid: validation.valid,
      marketValid: validation.market?.valid,
      shippingAvailable: validation.shipping?.available,
      shippingRatesCount: validation.shipping?.rates?.length || 0,
      inventoryValid: validation.inventory?.valid,
      errors: validation.errors?.length || 0,
    });
    
    if (!validation.valid) {
      console.warn(`[API] ⚠️  Validation failed:`, validation.errors);
    }

    const apiDuration = Date.now() - apiStartTime;
    console.log(`[API] ✅ Validation API complete (${apiDuration}ms total)`);
    // Always 200 with structured payload so the UI can show validation.errors
    return NextResponse.json(validation);
  } catch (error) {
    const apiDuration = Date.now() - apiStartTime;
    console.error(`[API] ❌ Checkout validation error (${apiDuration}ms):`, error);
    console.error(`[API] ❌ Error details:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    // Still return a UI-friendly validation payload (not a bare 500)
    return NextResponse.json(
      {
        valid: false,
        error: error.message || 'Validation failed',
        errors: [error.message || 'Validation failed'],
        market: { valid: false },
        inventory: { valid: false, unavailableItems: [] },
        shipping: { available: false, rates: [], error: error.message || 'Validation failed' },
        unavailableItems: [],
      },
      { status: 200 }
    );
  }
}

