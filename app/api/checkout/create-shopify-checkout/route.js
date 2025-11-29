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

    // Validate that at least country and city are provided (full address collected in Shopify checkout)
    if (!shippingAddress.countryCode && !shippingAddress.country) {
      return NextResponse.json(
        { error: 'Country is required' },
        { status: 400 }
      );
    }

    if (!shippingAddress.city) {
      return NextResponse.json(
        { error: 'City is required' },
        { status: 400 }
      );
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
    const resolveResponse = await fetch(`${request.url.split('/api')[0]}/api/checkout/resolve-shopify-variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart, storefront }),
    });

    if (!resolveResponse.ok) {
      const errorData = await resolveResponse.json();
      throw new Error(errorData.error || 'Failed to resolve Shopify variant IDs');
    }

    const { cart: resolvedCart } = await resolveResponse.json();

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
    
    // Add market and storefront to custom attributes (for webhook routing)
    const attributesWithMarket = [
      ...customAttributes,
      { key: '_market', value: market }, // Market identifier (FI, DE, etc.)
      { key: '_storefront', value: storefront }, // Storefront identifier (LUNERA, GIFTSHOP, etc.)
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

    // Convert checkout URL from custom domain to .myshopify.com domain
    // Shopify may return checkout URLs on custom domain, but we need to use .myshopify.com for checkout
    if (finalCheckoutUrl) {
      try {
        const url = new URL(finalCheckoutUrl);
        // If checkout URL uses custom domain (not .myshopify.com), replace with .myshopify.com
        if (!url.hostname.includes('.myshopify.com')) {
          // Extract the store name from the custom domain or env var
          const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE_URL || '';
          let myshopifyDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
          
          // If env var uses custom domain, extract store name and add .myshopify.com
          if (!myshopifyDomain.includes('.myshopify.com')) {
            // Extract store name (e.g., "blerinas" from "blerinas.com")
            const storeName = myshopifyDomain.split('.')[0];
            myshopifyDomain = `${storeName}.myshopify.com`;
          }
          
          // Extract the path and query from the checkout URL
          const checkoutPath = url.pathname + url.search;
          // Build new URL with .myshopify.com domain
          finalCheckoutUrl = `https://${myshopifyDomain}${checkoutPath}`;
          console.log(`[API] 🔄 Converted checkout URL from ${url.hostname} to ${myshopifyDomain}`);
        }
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

