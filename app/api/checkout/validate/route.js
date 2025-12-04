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
    const { cart, shippingAddress } = body;

    console.log(`[API] 📦 Validation request - Cart items: ${cart?.length || 0}, Country: ${shippingAddress?.countryCode || shippingAddress?.country || 'N/A'}`);
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

    // Validate that country is provided
    const countryCode = shippingAddress.countryCode || shippingAddress.country;
    if (!countryCode) {
      console.error(`[API] ❌ Invalid request: Country is missing`);
      return NextResponse.json(
        { error: 'Country is required for shipping validation' },
        { status: 400 }
      );
    }

    // Validate product market availability first
    console.log(`[API] 🔍 Validating product market availability for country: ${countryCode}...`);
    const db = getAdminDb();
    if (!db) {
      console.error(`[API] ❌ Firebase Admin not initialized`);
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get storefront from cart items (all items should be from same storefront)
    const storefront = cart[0]?.storefront || 'LUNERA';
    
    // Fetch products to check market availability
    const productsPath = getCollectionPath('products', storefront);
    let productsRef = db;
    productsPath.forEach((segment, index) => {
      if (index % 2 === 0) {
        productsRef = productsRef.collection(segment);
      } else {
        productsRef = productsRef.doc(segment);
      }
    });

    const unavailableProducts = [];
    for (const item of cart) {
      try {
        const productRef = productsRef.doc(item.productId);
        const productDoc = await productRef.get();
        
        if (!productDoc.exists()) {
          unavailableProducts.push({
            productId: item.productId,
            productName: item.productName || item.productId,
            reason: 'Product not found'
          });
          continue;
        }

        const productData = productDoc.data();
        
        // Check if product is available in the selected market
        let isAvailableInMarket = false;
        if (productData.marketsObject && typeof productData.marketsObject === 'object') {
          const marketData = productData.marketsObject[countryCode];
          isAvailableInMarket = marketData && marketData.available !== false;
        } else if (productData.markets && Array.isArray(productData.markets)) {
          isAvailableInMarket = productData.markets.includes(countryCode);
        }

        if (!isAvailableInMarket) {
          unavailableProducts.push({
            productId: item.productId,
            productName: item.productName || productData.name || item.productId,
            reason: `Product is not available in ${countryCode}`
          });
        }
      } catch (error) {
        console.error(`[API] ❌ Error checking product ${item.productId}:`, error);
        unavailableProducts.push({
          productId: item.productId,
          productName: item.productName || item.productId,
          reason: 'Error checking product availability'
        });
      }
    }

    if (unavailableProducts.length > 0) {
      console.error(`[API] ❌ ${unavailableProducts.length} product(s) not available in market ${countryCode}:`, unavailableProducts);
      return NextResponse.json({
        valid: false,
        error: 'Some products are not available in the selected country',
        errors: unavailableProducts.map(p => `${p.productName} is not available in ${countryCode}`),
        unavailableProducts
      });
    }

    console.log(`[API] ✅ All products are available in market ${countryCode}`);

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

