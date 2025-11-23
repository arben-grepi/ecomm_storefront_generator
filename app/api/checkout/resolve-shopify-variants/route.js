import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-server';
import { getStorefrontFromRequest } from '@/lib/get-storefront-server';

/**
 * Resolve Firestore variant IDs to Shopify variant IDs
 * Called before checkout creation to ensure we have Shopify variant IDs
 * 
 * Cart items have Firestore variant document IDs, but Storefront API needs Shopify variant IDs
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { cart, storefront: bodyStorefront } = body;
    const storefront = bodyStorefront || getStorefrontFromRequest(request);

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json(
        { error: 'Cart is required and must not be empty' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    if (!db) {
      throw new Error('Firebase Admin DB not available');
    }

    // Resolve Shopify variant IDs for each cart item
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
          const variantRef = db
            .collection(storefront)
            .collection('products')
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
            // If missing shopifyVariantId, this might be a manual product
            // For manual products, we can't create Shopify checkout - they need to be created via Admin API
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

    return NextResponse.json({
      ok: true,
      cart: resolvedCart,
    });
  } catch (error) {
    console.error('Failed to resolve Shopify variants:', error);
    return NextResponse.json(
      {
        error: 'Failed to resolve Shopify variants',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

