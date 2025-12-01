/**
 * API route to fetch products from Shopify Admin API
 * Returns products with variants for selection in the import modal
 */

import { NextResponse } from 'next/server';

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2025-10';

/**
 * Fetch all products from Shopify Admin API
 */
async function fetchAllShopifyProducts() {
  const storeUrl = SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = SHOPIFY_ACCESS_TOKEN;

  if (!storeUrl || !accessToken) {
    throw new Error('Missing Shopify Admin API credentials. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.');
  }

  const allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const url = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250${cursor ? `&since_id=${cursor}` : ''}`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    const products = data.products || [];

    allProducts.push(...products);

    // Check if there are more products
    if (products.length < 250) {
      hasNextPage = false;
    } else {
      // Use the last product's ID as cursor for pagination
      cursor = products[products.length - 1].id;
    }
  }

  return allProducts;
}

/**
 * GET endpoint to fetch products from Shopify
 */
export async function GET() {
  try {
    console.log('[Fetch Products API] 🚀 Fetching products from Shopify...');

    const products = await fetchAllShopifyProducts();

    // Transform products to include only necessary data
    const transformedProducts = products.map((product) => ({
      id: product.id.toString(),
      title: product.title,
      handle: product.handle,
      status: product.status,
      vendor: product.vendor,
      productType: product.product_type,
      tags: product.tags,
      variants: (product.variants || []).map((variant) => ({
        id: variant.id.toString(),
        title: variant.title,
        name: variant.title, // For compatibility
        sku: variant.sku,
        price: variant.price,
        inventoryQuantity: variant.inventory_quantity || 0,
        inventoryItemId: variant.inventory_item_id,
        option1: variant.option1,
        option2: variant.option2,
        option3: variant.option3,
        selectedOptions: [
          { name: 'Option 1', value: variant.option1 },
          { name: 'Option 2', value: variant.option2 },
          { name: 'Option 3', value: variant.option3 },
        ].filter((opt) => opt.value), // Remove empty options
      })),
      images: (product.images || []).map((img) => ({
        id: img.id,
        src: img.src,
        alt: img.alt || product.title,
      })),
    }));

    console.log(`[Fetch Products API] ✅ Fetched ${transformedProducts.length} products from Shopify`);

    return NextResponse.json({
      success: true,
      products: transformedProducts,
      count: transformedProducts.length,
    });
  } catch (error) {
    console.error('[Fetch Products API] ❌ Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch products from Shopify',
      },
      { status: 500 }
    );
  }
}

