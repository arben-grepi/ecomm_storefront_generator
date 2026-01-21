import { NextResponse } from 'next/server';
import { createCart, updateCartBuyerIdentity, verifyStorefrontVariantAccessibility } from '@/lib/shopify-storefront-api';
import { getStorefrontFromRequest } from '@/lib/get-storefront-server';

/**
 * Create a Shopify checkout session via Storefront API
 * Returns checkout URL that redirects to Shopify's hosted checkout
 * 
 * This endpoint should be called server-side only (never expose Storefront API token client-side)
 */
export async function POST(request) {
  const apiStartTime = Date.now();
  console.log(`[API] 🛒 POST /api/checkout/create-shopify-checkout: Request received`);
  
  // Get the origin/host from the request to build return URL
  const origin = request.headers.get('origin') || request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = origin 
    ? (origin.startsWith('http') ? origin : `${protocol}://${origin}`)
    : (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.blerinas.com');
  
  try {
    const body = await request.json();
    const {
      cart,
      shippingAddress,
      storefront: bodyStorefront,
      customAttributes = [],
    } = body;
    
    // Extract storefront from request URL or use body parameter
    const storefront = bodyStorefront || getStorefrontFromRequest(request);
    
    console.log(`[API] 📦 Checkout request - Storefront: ${storefront}, Cart items: ${cart?.length || 0}, Address: ${shippingAddress?.city || 'N/A'}, ${shippingAddress?.countryCode || shippingAddress?.country || 'N/A'}`);

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      console.error(`[API] ❌ Invalid request: Cart is empty or missing`);
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

    // Validate that at least country is provided (full address collected in Shopify checkout)
    if (!shippingAddress.countryCode && !shippingAddress.country) {
      return NextResponse.json(
        { error: 'Country is required' },
        { status: 400 }
      );
    }

    // City is optional - if not provided, we'll use a placeholder or let Shopify collect it
    // Shopify checkout will collect the full address anyway
    if (!shippingAddress.city) {
      console.log(`[API] ⚠️  City not provided, using placeholder for Shopify checkout`);
      shippingAddress.city = shippingAddress.countryCode || shippingAddress.country || 'City';
    }

    // Validate cart items have required fields
    const invalidItems = cart.filter(
      item => !item.variantId || !item.quantity || item.quantity <= 0
    );
    if (invalidItems.length > 0) {
      return NextResponse.json(
        { error: 'Invalid cart items: variantId and quantity are required' },
        { status: 400 }
      );
    }

    // Resolve Firestore variant IDs to Shopify variant IDs
    // Cart items have Firestore variant document IDs, but Storefront API needs Shopify variant IDs
    // Directly call the resolve logic instead of making an HTTP request (avoids network issues in production)
    const { getAdminDb } = await import('@/lib/firestore-server');
    const db = getAdminDb();
    if (!db) {
      throw new Error('Firebase Admin DB not available');
    }

    const resolvedCart = await Promise.all(
      cart.map(async (item) => {
        // If shopifyVariantId already exists, use it
        if (item.shopifyVariantId) {
          return {
            ...item,
            shopifyVariantId: item.shopifyVariantId,
          };
        }

        // Otherwise, fetch from Firestore
        try {
          // Path: {storefront}/products/items/{productId}/variants/{variantId}
          // Note: Admin SDK requires .doc() between collection calls
          const variantRef = db
            .collection(storefront)
            .doc('products')
            .collection('items')
            .doc(item.productId)
            .collection('variants')
            .doc(item.variantId);

          const variantDoc = await variantRef.get();

          if (!variantDoc.exists()) {
            throw new Error(`Variant ${item.variantId} not found for product ${item.productId} in storefront ${storefront}`);
          }

          const variantData = variantDoc.data();
          const shopifyVariantId = variantData.shopifyVariantId || null;

          if (!shopifyVariantId) {
            throw new Error(`Variant ${item.variantId} missing shopifyVariantId. This product may not be available for checkout via Storefront API.`);
          }

          return {
            ...item,
            shopifyVariantId: shopifyVariantId.toString(), // Ensure it's a string for consistency
          };
        } catch (error) {
          console.error(`Failed to resolve variant ${item.variantId} for product ${item.productId}:`, error);
          throw error;
        }
      })
    );

    // Transform cart to line items for Storefront API
    // Now we have Shopify variant IDs
    const lineItems = resolvedCart
      .map((item) => {
        if (!item.shopifyVariantId) {
          throw new Error(`Cart item missing Shopify variant ID: ${JSON.stringify(item)}`);
        }

        return {
          variantId: item.shopifyVariantId, // Shopify variant ID (number)
          quantity: item.quantity,
        };
      })
      .filter(item => item.variantId); // Filter out items without Shopify variant ID

    // Verify variants are accessible in Storefront API before creating cart
    // This prevents "merchandise does not exist" errors due to indexing delays
    const variantIds = lineItems.map(item => item.variantId);
    console.log(`[API] 🔍 Verifying variant accessibility in Storefront API for ${variantIds.length} variant(s)...`);
    
    const verificationResult = await verifyStorefrontVariantAccessibility(variantIds);
    
    if (!verificationResult.accessible) {
      const inaccessibleCount = verificationResult.inaccessibleVariants.length;
      const reasons = verificationResult.inaccessibleVariants.map(v => v.reason);
      const hasNotIndexed = reasons.includes('not_indexed');
      
      console.warn(`[API] ⚠️  ${inaccessibleCount} variant(s) not accessible in Storefront API:`, verificationResult.inaccessibleVariants);
      
      if (hasNotIndexed) {
        // Variants not yet indexed - return helpful error message
        return NextResponse.json(
          {
            error: 'variants_not_indexed',
            message: 'Some products are still being prepared for checkout. Please wait a moment and try again.',
            details: verificationResult.inaccessibleVariants.map(v => ({
              variantId: v.variantId,
              reason: v.reason,
              message: v.message,
            })),
            retryAfter: 30, // Suggest retrying after 30 seconds
          },
          { status: 503 } // Service Unavailable - temporary issue
        );
      } else {
        // Variants exist but not available for sale
        return NextResponse.json(
          {
            error: 'variants_not_available',
            message: 'Some products in your cart are no longer available.',
            details: verificationResult.inaccessibleVariants.map(v => ({
              variantId: v.variantId,
              reason: v.reason,
              message: v.message,
            })),
          },
          { status: 400 }
        );
      }
    }

    console.log(`[API] ✅ All ${verificationResult.accessibleVariants.length} variant(s) verified as accessible in Storefront API`);

    // Get market from cookie or shipping address
    const market = shippingAddress.countryCode || shippingAddress.country || 'DE';
    
    // Add market, storefront, and storefront_return to custom attributes (for webhook routing)
    // storefront_return is used by Shopify to redirect customers back to the correct storefront after checkout
    const storefrontReturnPath = `blerinas/${storefront}`;
    const attributesWithMarket = [
      ...customAttributes,
      { key: '_market', value: market }, // Market identifier (FI, DE, etc.)
      { key: '_storefront', value: storefront }, // Storefront identifier (LUNERA, GIFTSHOP, etc.)
      { key: 'storefront_return', value: storefrontReturnPath }, // Return path for post-checkout redirect (blerinas/{storefront})
    ];

    // Create cart via Storefront API (Cart API replaces deprecated Checkout API)
    const cartCreateStartTime = Date.now();
    console.log(`[API] 🛒 Creating Shopify cart - Storefront: ${storefront}, Market: ${market}, Items: ${lineItems.length}, Address: ${shippingAddress.city}, ${shippingAddress.countryCode}`);
    
    let cartResult;
    try {
      cartResult = await createCart({
        lineItems,
        market,
        storefront,
        customAttributes: attributesWithMarket,
      });
      const cartCreateDuration = Date.now() - cartCreateStartTime;
      console.log(`[API] ✅ Shopify cart created successfully - Cart ID: ${cartResult.cartId} (${cartCreateDuration}ms)`);
    } catch (error) {
      const cartCreateDuration = Date.now() - cartCreateStartTime;
      // If cart creation fails with "merchandise does not exist" even after verification,
      // it might be a race condition - suggest retry
      if (error.message && error.message.includes('does not exist')) {
        console.error(`[API] ❌ Cart creation failed despite verification - possible race condition (${cartCreateDuration}ms):`, error.message);
        return NextResponse.json(
          {
            error: 'cart_creation_failed',
            message: 'Unable to create checkout. The products may still be indexing. Please try again in a moment.',
            retryAfter: 30,
          },
          { status: 503 }
        );
      }
      console.error(`[API] ❌ Cart creation failed (${cartCreateDuration}ms):`, error);
      throw error; // Re-throw other errors
    }
    
    const { cartId, checkoutUrl } = cartResult;

    // Update cart with shipping address if provided
    let finalCheckoutUrl = checkoutUrl;
    if (shippingAddress && shippingAddress.address1 && shippingAddress.city) {
      try {
        const updatedCart = await updateCartBuyerIdentity(cartId, shippingAddress, market);
        finalCheckoutUrl = updatedCart.checkoutUrl;
        console.log(`[API] ✅ Cart buyer identity updated`);
      } catch (error) {
        console.warn(`[API] ⚠️  Failed to update cart buyer identity, using original checkout URL:`, error.message);
      }
    }

    // Convert checkout URL to use the correct .myshopify.com domain
    // Replace any domain with pdvt0w-an.myshopify.com
    // Also add return_to parameter for "Continue Shopping" button and thank-you page redirect
    if (finalCheckoutUrl) {
      try {
        const url = new URL(finalCheckoutUrl);
        
        // Determine the base URL for thank-you page redirect
        const protocol = request.headers.get('x-forwarded-proto') || 'https';
        const host = request.headers.get('host');
        const baseUrl = `${protocol}://${host}`;
        
        // Thank-you page URL - Shopify will redirect here after checkout completion
        // The confirmation number will be in the URL parameters
        const thankYouUrl = `${baseUrl}/thank-you`;
        
        // Determine the return URL for "Continue Shopping" button
        // Use Shopify redirect page (pdvt0w-an.myshopify.com/pages/redirect) which then redirects to blerinas.com
        // This works because Shopify allows redirects to its own domain, avoiding domain whitelist issues
        const shopifyRedirectUrl = `https://pdvt0w-an.myshopify.com/pages/redirect?storefront=${encodeURIComponent(storefront)}`;
        
        // Add return_to parameter to the checkout URL (for "Continue Shopping" button)
        // The Shopify redirect page will handle redirecting to blerinas.com/{storefront}
        url.searchParams.set('return_to', shopifyRedirectUrl);
        console.log(`[API] 🔗 Setting return_to URL: ${shopifyRedirectUrl} (storefront: ${storefront})`);
        
        // Add storefront return path parameter for Shopify to use for dynamic redirects (if needed)
        // Format: blerinas/{storefront} (e.g., blerinas/LUNERA, blerinas/FIVESTARFINDS)
        // Note: This is also passed as customAttribute for webhook, URL param is backup
        url.searchParams.set('storefront_return', storefrontReturnPath);
        
        // Note: Shopify will redirect to thank-you page automatically after checkout completion
        // The thank-you page will read confirmation number from URL params or use localStorage session
        
        // Extract the path and query from the checkout URL
        const checkoutPath = url.pathname + url.search;
        // Build new URL with pdvt0w-an.myshopify.com domain
        finalCheckoutUrl = `https://pdvt0w-an.myshopify.com${checkoutPath}`;
        console.log(`[API] 🔄 Converted checkout URL from ${url.hostname} to pdvt0w-an.myshopify.com with return_to=${shopifyRedirectUrl}`);
        console.log(`[API] 📧 Thank-you page URL: ${thankYouUrl}`);
      } catch (error) {
        console.warn(`[API] ⚠️  Failed to parse/convert checkout URL:`, error.message);
      }
    }

    const apiDuration = Date.now() - apiStartTime;
    console.log(`[API] ✅ Checkout created successfully - Cart ID: ${cartId}, URL: ${finalCheckoutUrl} (${apiDuration}ms total)`);

    // Note: Shipping rates not available via Cart API - they're shown on Shopify's checkout page
    return NextResponse.json({
      ok: true,
      cartId,
      checkoutId: cartId, // For backward compatibility
      checkoutUrl: finalCheckoutUrl,
      shippingRates: [], // Not available via Cart API - shown on checkout page
    });
  } catch (error) {
    const apiDuration = Date.now() - apiStartTime;
    console.error(`[API] ❌ Failed to create Shopify checkout (${apiDuration}ms):`, error);
    console.error(`[API] ❌ Error details:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      {
        error: 'Failed to create checkout',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

