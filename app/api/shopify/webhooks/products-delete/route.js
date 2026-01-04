import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { deleteAllProductVariants } from '@/lib/delete-deleted-products';

/**
 * Verify Shopify webhook HMAC signature
 */
function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  
  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET not configured in environment variables');
    return false;
  }

  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  const isValid = digest === hmacHeader;
  
  if (!isValid) {
    console.error('Webhook signature verification failed. Make sure SHOPIFY_WEBHOOK_SECRET matches Shopify webhook secret.');
  }

  return isValid;
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      console.error('Missing x-shopify-hmac-sha256 header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify webhook signature
    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    
    // Product delete payload contains the product ID
    const shopifyProductId = payload.id;

    console.log(`[Delete Webhook] 🗑️  Received product deletion webhook: product_id=${shopifyProductId}`);

    // Use existing deletion function that handles:
    // - Deleting from shopifyItems
    // - Deleting from all storefronts (products and variants)
    // - Removing from categories
    const deletionResult = await deleteAllProductVariants(shopifyProductId, []);

    if (!deletionResult.success) {
      console.error(`[Delete Webhook] ❌ Failed to delete product ${shopifyProductId}:`, deletionResult.error);
      return NextResponse.json(
        { 
          ok: false, 
          shopifyProductId,
          error: deletionResult.error,
          message: 'Failed to delete product from database'
        },
        { status: 500 }
      );
    }

    console.log(`[Delete Webhook] ✅ Product ${shopifyProductId} deleted successfully:`);
    console.log(`[Delete Webhook]    - ShopifyItems: ${deletionResult.shopifyItems.deletedProducts} product(s) deleted`);
    console.log(`[Delete Webhook]    - Storefronts: ${deletionResult.storefronts.deletedVariants} variant(s), ${deletionResult.storefronts.deletedProducts} product(s) deleted`);
    console.log(`[Delete Webhook]    - Categories: ${deletionResult.categories.updatedCategories} updated, ${deletionResult.categories.deletedCategories} deleted`);

    return NextResponse.json({ 
      ok: true, 
      shopifyProductId,
      deletionResult,
      message: `Product deleted: ${deletionResult.storefronts.deletedProducts} product(s) and ${deletionResult.storefronts.deletedVariants} variant(s) removed from all storefronts`
    });
  } catch (error) {
    console.error('Product deletion webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification during setup)
export async function GET() {
  return NextResponse.json({ message: 'Shopify product deletion webhook endpoint is active' });
}

