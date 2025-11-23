#!/usr/bin/env node

/**
 * Diagnostic script to check Storefront API configuration
 * 
 * This script verifies:
 * 1. Storefront API credentials are configured
 * 2. Required scopes are enabled (especially unauthenticated_read_product_listings)
 * 3. Products are accessible via Storefront API
 * 4. Variants can be queried
 * 
 * Usage:
 *   node scripts/check-storefront-api-config.js [productId]
 * 
 * Examples:
 *   node scripts/check-storefront-api-config.js
 *   node scripts/check-storefront-api-config.js 10408855568727
 */

require('dotenv').config({ path: '.env.local' });

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE_URL;
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2025-10';

// Get product ID from command line or use a test product
const testProductId = process.argv[2] || null;

function getStorefrontCredentials() {
  const storeDomain = SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  
  if (!storeDomain || !accessToken) {
    console.error('\n❌ Missing Storefront API credentials!\n');
    console.error('Required environment variables:');
    console.error('  - SHOPIFY_STORE_DOMAIN or SHOPIFY_STORE_URL');
    console.error('  - SHOPIFY_STOREFRONT_ACCESS_TOKEN');
    console.error('\nPlease check your .env.local file.\n');
    process.exit(1);
  }
  
  return { storeDomain, accessToken };
}

/**
 * Test basic Storefront API connectivity and check publication
 */
async function testStorefrontAPIConnectivity(storeDomain, accessToken) {
  console.log('\n🔍 Testing Storefront API connectivity and checking publication...\n');
  
  // Query to test basic connectivity
  const query = `
    query {
      shop {
        name
        primaryDomain {
          host
          url
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${storeDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': accessToken,
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Storefront API request failed: ${response.status} ${response.statusText}`);
      console.error('Response:', errorText);
      return false;
    }

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ Storefront API GraphQL errors:');
      result.errors.forEach(err => {
        console.error(`  - ${err.message}`);
        if (err.extensions) {
          console.error(`    Extensions:`, JSON.stringify(err.extensions, null, 2));
        }
      });
      
      // Check for scope-related errors
      const hasScopeError = result.errors.some(err => 
        err.message.toLowerCase().includes('scope') || 
        err.message.toLowerCase().includes('permission') ||
        err.message.toLowerCase().includes('unauthorized')
      );
      
      if (hasScopeError) {
        console.error('\n⚠️  Possible scope issue detected!');
        console.error('   Check your Storefront API scopes in Shopify Admin.');
      }
      
      return false;
    }

    if (result.data?.shop) {
      console.log('✅ Storefront API connectivity: OK');
      console.log(`   Shop: ${result.data.shop.name}`);
      console.log(`   Domain: ${result.data.shop.primaryDomain?.host || 'N/A'}`);
      console.log(`\n💡 Note: Storefront API queries the publication your access token is scoped to.`);
      console.log(`   If you see products, they're from the publication your token queries.`);
      return true;
    }

    console.error('❌ Unexpected response format');
    return false;
  } catch (error) {
    console.error('❌ Failed to connect to Storefront API:');
    console.error(`   ${error.message}`);
    return false;
  }
}

/**
 * Check if products can be queried (tests unauthenticated_read_product_listings scope)
 * Also shows which publication is being queried and warns if not "Online Store"
 */
async function testProductListingsAccess(storeDomain, accessToken) {
  console.log('\n🔍 Testing product listings access (unauthenticated_read_product_listings scope)...\n');
  
  const query = `
    query {
      products(first: 10) {
        edges {
          node {
            id
            title
            handle
            availableForSale
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${storeDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': accessToken,
        },
        body: JSON.stringify({ query }),
      }
    );

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ Failed to query products:');
      result.errors.forEach(err => {
        console.error(`  - ${err.message}`);
      });
      
      // Check for scope-related errors
      const scopeError = result.errors.find(err => 
        err.message.toLowerCase().includes('scope') || 
        err.message.toLowerCase().includes('permission') ||
        err.message.toLowerCase().includes('unauthorized') ||
        err.message.toLowerCase().includes('access denied')
      );
      
      if (scopeError) {
        console.error('\n⚠️  SCOPE ISSUE DETECTED!\n');
        console.error('   The "unauthenticated_read_product_listings" scope is required.');
        console.error('\n   To fix this:');
        console.error('   1. Go to Shopify Admin → Settings → Apps and sales channels');
        console.error('   2. Click "Develop apps" (or find your custom app)');
        console.error('   3. Click on your app');
        console.error('   4. Go to "Configuration" tab → "Storefront API access scopes"');
        console.error('   5. Enable: "unauthenticated_read_product_listings"');
        console.error('   6. Save and reinstall the access token');
        console.error('   7. Update SHOPIFY_STOREFRONT_ACCESS_TOKEN in .env.local\n');
      }
      
      return { success: false, products: [] };
    }

    const products = result.data?.products?.edges || [];
    
    if (products.length === 0) {
      console.log('⚠️  No products found in Storefront API');
      console.log('   This could mean:');
      console.log('   - No products are published to the publication your Storefront API token is querying');
      console.log('   - Products are not yet indexed (wait 30-60 seconds after publishing)');
      console.log('   - Scope issue (check unauthenticated_read_product_listings)');
      console.log('   - Publication mismatch (token might be for a different catalog like "Blerinas")');
      console.log('\n⚠️  IMPORTANT: Your Storefront API token should query "Online Store" publication, not custom catalogs!');
      console.log('   See docs/switch-to-online-store-publication.md for instructions.\n');
      return { success: false, products: [] };
    }

    console.log(`✅ Product listings access: OK (found ${products.length} product(s))`);
    
    console.log('\n   Sample products:');
    products.slice(0, 5).forEach((edge, idx) => {
      const product = edge.node;
      console.log(`   ${idx + 1}. ${product.title}`);
      console.log(`      Handle: ${product.handle}`);
      console.log(`      Available: ${product.availableForSale ? 'Yes' : 'No'}`);
      console.log(`      ID: ${product.id}`);
    });
    
    // Check if we're querying the wrong publication
    console.log(`\n💡 Publication Check:`);
    console.log(`   The products shown above are from the publication your Storefront API token queries.`);
    console.log(`   ⚠️  IMPORTANT: Your token should query "Online Store" publication, NOT custom catalogs like "Blerinas"!`);
    console.log(`   If you see products but they're not the ones you published to "Online Store", your token is scoped to the wrong publication.`);
    console.log(`   Check in Shopify Admin → Products → [Product] → Sales channels to see which publication products are in.`);
    console.log(`   See docs/switch-to-online-store-publication.md for instructions to fix this.\n`);
    
    return { success: true, products };
  } catch (error) {
    console.error('❌ Failed to query products:');
    console.error(`   ${error.message}`);
    return { success: false, products: [] };
  }
}

/**
 * Check specific product by ID
 */
async function checkProductById(storeDomain, accessToken, productId) {
  console.log(`\n🔍 Checking product by ID: ${productId}...\n`);
  
  // Convert Admin API ID to Storefront API ID format
  const numericId = productId.toString().replace('gid://shopify/Product/', '');
  const storefrontId = `gid://shopify/Product/${numericId}`;
  
  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        availableForSale
        totalInventory
        variants(first: 10) {
          edges {
            node {
              id
              title
              availableForSale
              quantityAvailable
              priceV2 {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${storeDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query,
          variables: { id: storefrontId },
        }),
      }
    );

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ Failed to query product:');
      result.errors.forEach(err => {
        console.error(`  - ${err.message}`);
      });
      return null;
    }
    
    const product = result.data?.product;
    
    if (!product) {
      console.log('⏳ Product not found in Storefront API');
      console.log('   This could mean:');
      console.log('   - Product is not published to Online Store');
      console.log('   - Product is not yet indexed (wait 30-60 seconds after publishing)');
      console.log('   - Product ID is incorrect');
      return null;
    }
    
    console.log('✅ Product found in Storefront API!');
    console.log(`   ID: ${product.id}`);
    console.log(`   Title: ${product.title}`);
    console.log(`   Handle: ${product.handle}`);
    console.log(`   Available for sale: ${product.availableForSale ? 'Yes' : 'No'}`);
    console.log(`   Total inventory: ${product.totalInventory || 0}`);
    console.log(`   Variants: ${product.variants.edges.length}`);
    console.log(`\n💡 Publication Note:`);
    console.log(`   If this product is accessible, it's published to the publication your Storefront API token queries.`);
    console.log(`   To check which publication, go to Shopify Admin → Products → [Product] → Sales channels.`);
    
    if (product.variants.edges.length > 0) {
      console.log('\n   Variants:');
      product.variants.edges.slice(0, 5).forEach((edge, idx) => {
        const variant = edge.node;
        console.log(`   ${idx + 1}. ${variant.title}`);
        console.log(`      ID: ${variant.id}`);
        console.log(`      Available: ${variant.availableForSale ? 'Yes' : 'No'}`);
        console.log(`      Quantity: ${variant.quantityAvailable || 0}`);
        console.log(`      Price: ${variant.priceV2?.amount || 'N/A'} ${variant.priceV2?.currencyCode || ''}`);
      });
      
      const accessibleVariants = product.variants.edges.filter(e => e.node.availableForSale);
      console.log(`\n   ✅ ${accessibleVariants.length}/${product.variants.edges.length} variants accessible for checkout`);
    }
    
    return product;
  } catch (error) {
    console.error('❌ Failed to check product:');
    console.error(`   ${error.message}`);
    return null;
  }
}

/**
 * Check product by handle (alternative method)
 */
async function checkProductByHandle(storeDomain, accessToken, handle) {
  console.log(`\n🔍 Checking product by handle: ${handle}...\n`);
  
  const query = `
    query getProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        availableForSale
        totalInventory
        variants(first: 10) {
          edges {
            node {
              id
              title
              availableForSale
              quantityAvailable
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${storeDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query,
          variables: { handle },
        }),
      }
    );

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ Failed to query product by handle:');
      result.errors.forEach(err => {
        console.error(`  - ${err.message}`);
      });
      return null;
    }
    
    const product = result.data?.productByHandle;
    
    if (!product) {
      console.log('⏳ Product not found by handle');
      return null;
    }
    
    console.log('✅ Product found by handle!');
    console.log(`   Title: ${product.title}`);
    console.log(`   Available: ${product.availableForSale ? 'Yes' : 'No'}`);
    console.log(`   Variants: ${product.variants.edges.length}`);
    
    return product;
  } catch (error) {
    console.error('❌ Failed to check product by handle:');
    console.error(`   ${error.message}`);
    return null;
  }
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  console.log('\n' + '='.repeat(70));
  console.log('  Storefront API Configuration Diagnostic');
  console.log('='.repeat(70));
  
  const { storeDomain, accessToken } = getStorefrontCredentials();
  
  console.log(`\n📋 Configuration:`);
  console.log(`   Store Domain: ${storeDomain}`);
  console.log(`   API Version: ${SHOPIFY_API_VERSION}`);
  console.log(`   Access Token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'NOT SET'}`);
  
  // Test 1: Basic connectivity
  const connectivityOk = await testStorefrontAPIConnectivity(storeDomain, accessToken);
  
  if (!connectivityOk) {
    console.error('\n❌ Basic connectivity test failed. Cannot proceed with further tests.\n');
    process.exit(1);
  }
  
  // Test 2: Product listings access (scope check)
  const productListingsResult = await testProductListingsAccess(storeDomain, accessToken);
  
  if (!productListingsResult.success) {
    console.error('\n❌ Product listings test failed. Check your Storefront API scopes.\n');
    console.error('   Required scope: unauthenticated_read_product_listings\n');
    process.exit(1);
  }
  
  // Test 3: Specific product if provided
  if (testProductId) {
    const product = await checkProductById(storeDomain, accessToken, testProductId);
    
    if (product) {
      console.log('\n✅ All tests passed! Product is accessible in Storefront API.');
    } else {
      console.log('\n⚠️  Product not accessible. Check publication and indexing status.');
    }
  } else {
    console.log('\n💡 Tip: Test a specific product by providing product ID:');
    console.log(`   node scripts/check-storefront-api-config.js 10408855568727\n`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  Summary');
  console.log('='.repeat(70));
  console.log('✅ Storefront API connectivity: OK');
  console.log('✅ Product listings access: OK');
  
  if (productListingsResult.success) {
    const products = productListingsResult.products || [];
    console.log('\n✅ Configuration looks good!');
    console.log('   Your Storefront API is properly configured with required scopes.');
    console.log('\n💡 Important notes:');
    console.log('   - Your Storefront API token queries a specific publication/catalog');
    console.log('   - Products shown above are from the publication your token queries');
    console.log('   - ⚠️  CRITICAL: For headless storefronts, use "Online Store" publication (NOT custom catalogs like "Blerinas")');
    console.log('   - Wait 30-60 seconds after publishing for indexing to complete');
    console.log('   - Products should be accessible for checkout creation once indexed.\n');
    
    // Check if products are accessible
    if (products.length > 0) {
      console.log('📢 Publication Check:');
      console.log('   ✅ Products are accessible in Storefront API');
      console.log('   ℹ️  These products are from the publication your token queries');
      console.log('   ⚠️  WARNING: If your token queries "Blerinas" or any custom catalog, you need to switch to "Online Store"!');
      console.log('   💡 If you expected different products, check which publication your token uses');
      console.log('   💡 To use "Online Store" publication: Delete custom catalogs or create new token');
      console.log('   📖 See docs/switch-to-online-store-publication.md for detailed instructions\n');
    }
  }
  
  // Additional diagnostic info
  console.log('📋 Troubleshooting checklist:');
  console.log('   [ ] Storefront API access token is configured correctly');
  console.log('   [ ] unauthenticated_read_product_listings scope is enabled');
  console.log('   [ ] Storefront API token queries "Online Store" publication (not custom catalog)');
  console.log('   [ ] Products are published to "Online Store" in Shopify Admin');
  console.log('   [ ] Wait 30-60 seconds after publishing for indexing');
  console.log('   [ ] Products have variants with availableForSale: true');
  console.log('\n💡 To switch to Online Store publication:');
  console.log('   1. Go to Shopify Admin → Settings → Apps and sales channels');
  console.log('   2. Click "Develop apps" → Your app');
  console.log('   3. Check "API credentials" tab → Storefront API access token');
  console.log('   4. If token is scoped to custom catalog (e.g., "Blerinas"):');
  console.log('      Option A: Delete the custom catalog (recommended)');
  console.log('      Option B: Create new Storefront API token scoped to "Online Store"');
  console.log('   5. Update SHOPIFY_STOREFRONT_ACCESS_TOKEN in .env.local with new token');
  console.log('');
}

// Run diagnostics
runDiagnostics().catch((error) => {
  console.error('\n❌ Diagnostic script failed:');
  console.error(error);
  process.exit(1);
});

