/**
 * API route to fetch products from Shopify Admin API
 * Returns products with variants for selection in the import modal
 */

import { NextResponse } from 'next/server';

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2025-10';

/**
 * Make a GraphQL request to Shopify Admin API
 * (Local copy to avoid module resolution issues)
 */
async function adminGraphQLRequest(query, variables = {}) {
  const storeUrl = SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = SHOPIFY_ACCESS_TOKEN;
  
  if (!storeUrl || !accessToken) {
    throw new Error('Missing Shopify Admin API credentials. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.');
  }
  
  const url = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify Admin GraphQL API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Shopify Admin GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

/**
 * Fetch all products from Shopify Admin API (REST)
 */
async function fetchAllShopifyProductsREST() {
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
 * Fetch publishedToOnlineStore status for a batch of products using GraphQL
 * Shopify limits nodes() queries to ~250 IDs, so we batch in chunks
 */
async function fetchPublicationStatuses(productIds) {
  if (productIds.length === 0) return {};

  const BATCH_SIZE = 250; // Shopify's limit for nodes() query
  const statusMap = {};
  
  // Process in batches
  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);
    const productGids = batch.map(id => `gid://shopify/Product/${id}`);
    
    // GraphQL query to get publication status for multiple products
    const query = `
      query getProductsPublicationStatus($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            publishedAt
            resourcePublications(first: 10) {
              edges {
                node {
                  publication {
                    id
                    name
                  }
                  isPublished
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      const data = await adminGraphQLRequest(query, { ids: productGids });
      
      if (data.nodes) {
        data.nodes.forEach((node) => {
          if (node && node.id) {
            const productId = node.id.replace('gid://shopify/Product/', '');
            // Check if published to Online Store
            const onlineStorePublication = node.resourcePublications?.edges?.find(
              (edge) => edge.node.publication?.name === 'Online Store'
            );
            statusMap[productId] = onlineStorePublication?.node.isPublished || false;
          }
        });
      }
    } catch (error) {
      console.error(`[Fetch Products API] Failed to fetch publication statuses for batch ${i}-${i + batch.length}:`, error);
      // Continue with other batches even if one fails
    }
  }
  
  return statusMap;
}

/**
 * GET endpoint to fetch products from Shopify
 */
export async function GET() {
  try {
    console.log('[Fetch Products API] 🚀 Fetching products from Shopify...');

    const products = await fetchAllShopifyProductsREST();
    console.log(`[Fetch Products API] ✅ Fetched ${products.length} products from REST API`);

    // Fetch publication statuses for all products (batch GraphQL query)
    const productIds = products.map(p => p.id.toString());
    console.log('[Fetch Products API] 📊 Fetching publication statuses...');
    const publicationStatuses = await fetchPublicationStatuses(productIds);
    console.log(`[Fetch Products API] ✅ Fetched publication statuses for ${Object.keys(publicationStatuses).length} products`);

    // Transform products to include only necessary data
    const transformedProducts = products.map((product) => {
      const productId = product.id.toString();
      const publishedToOnlineStore = publicationStatuses[productId] || false;
      
      return {
        id: productId,
        title: product.title,
        handle: product.handle,
        status: product.status,
        publishedToOnlineStore, // Add publication status
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
      };
    });

    console.log(`[Fetch Products API] ✅ Transformed ${transformedProducts.length} products`);

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

