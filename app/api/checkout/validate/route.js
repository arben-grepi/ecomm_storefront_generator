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
  const apiStartTime = Date.now();
  console.log(`[API] ✅ POST /api/checkout/validate: Request received`);
  
  try {
    const body = await request.json();
    const { cart, shippingAddress } = body;

    console.log(`[API] 📦 Validation request - Cart items: ${cart?.length || 0}, Address: ${shippingAddress?.city || 'N/A'}, ${shippingAddress?.countryCode || shippingAddress?.country || 'N/A'}`);
    console.log(`[API] 📋 Cart details:`, cart?.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      shopifyVariantId: item.shopifyVariantId,
      quantity: item.quantity,
    })));

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      console.error(`[API] ❌ Invalid request: Cart is empty or missing`);
      return NextResponse.json(
        { error: 'Cart is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!shippingAddress) {
      console.error(`[API] ❌ Invalid request: Shipping address is missing`);
      return NextResponse.json(
        { error: 'Shipping address is required' },
        { status: 400 }
      );
    }

    // Validate that at least country and city are provided
    if (!shippingAddress.countryCode && !shippingAddress.country) {
      console.error(`[API] ❌ Invalid request: Country is missing`);
      return NextResponse.json(
        { error: 'Country is required for shipping validation' },
        { status: 400 }
      );
    }

    if (!shippingAddress.city) {
      console.error(`[API] ❌ Invalid request: City is missing`);
      return NextResponse.json(
        { error: 'City is required for shipping validation' },
        { status: 400 }
      );
    }

    // Check if cart items have shopifyVariantId
    const missingShopifyIds = cart.filter(item => !item.shopifyVariantId);
    if (missingShopifyIds.length > 0) {
      console.warn(`[API] ⚠️  ${missingShopifyIds.length} cart item(s) missing shopifyVariantId:`, missingShopifyIds.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
      })));
      
      // If items are missing shopifyVariantId, we need to resolve them from Firestore
      console.log(`[API] 🔍 Attempting to resolve missing shopifyVariantIds from Firestore...`);
      // Note: This would require fetching from Firestore, which we'll handle in validateCheckout
    }

    const validateStartTime = Date.now();
    console.log(`[API] 🔍 Calling validateCheckout (inventory + shipping)...`);
    // Validate checkout (inventory + shipping)
    const validation = await validateCheckout({ cart, shippingAddress });
    const validateDuration = Date.now() - validateStartTime;
    
    console.log(`[API] ✅ Validation complete (${validateDuration}ms):`, {
      valid: validation.valid,
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
    return NextResponse.json(validation);
  } catch (error) {
    const apiDuration = Date.now() - apiStartTime;
    console.error(`[API] ❌ Checkout validation error (${apiDuration}ms):`, error);
    console.error(`[API] ❌ Error details:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
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

