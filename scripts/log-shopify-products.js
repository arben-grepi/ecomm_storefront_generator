#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });

/**
 * Fetch and log ALL Shopify products EXACTLY as Shopify returns them.
 *
 * Required ENV variables inside .env.local:
 *   SHOPIFY_STORE_URL=your-store.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN=your-access-token
 */

async function fetchAllProducts(storeUrl, accessToken) {
  const products = [];
  let pageInfo = null;
  let hasNextPage = true;

  const baseUrl = `https://${storeUrl}/admin/api/2025-10/products.json`;

  while (hasNextPage) {
    let url = baseUrl;
    if (pageInfo) {
      url += `?page_info=${pageInfo}`;
    }

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Shopify API error: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const data = await response.json();
    const pageProducts = data.products || [];
    products.push(...pageProducts);

    console.log(`Fetched ${pageProducts.length} products (total: ${products.length})`);

    const linkHeader = response.headers.get("link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]+page_info=([^>]+)>[^<]*rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return products;
}

async function main() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!storeUrl || !accessToken) {
    console.error("❌ Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN environment variables");
    process.exit(1);
  }

  console.log(`\n🛍️  Fetching raw products from Shopify: ${storeUrl}\n`);

  try {
    const products = await fetchAllProducts(storeUrl, accessToken);

    console.log("\n================ RAW SHOPIFY PRODUCTS ================\n");

    for (const product of products) {
      console.dir(product, { depth: null });
      console.log("\n------------------------------------------------------\n");
    }

    console.log(`\n✅ Done. Logged ${products.length} products.\n`);
  } catch (error) {
    console.error("❌ Failed to fetch:", error);
    process.exit(1);
  }
}

main();
