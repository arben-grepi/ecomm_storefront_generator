/**
 * Shopify Admin GraphQL API client
 * Used for querying product market information (publishedInContext)
 */

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2025-10';

function getAdminCredentials() {
  const storeUrl = SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = SHOPIFY_ACCESS_TOKEN;
  
  if (!storeUrl || !accessToken) {
    throw new Error('Missing Shopify Admin API credentials. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.');
  }
  
  return { storeUrl, accessToken };
}

/**
 * Make a GraphQL request to Shopify Admin API
 */
export async function adminGraphQLRequest(query, variables = {}) {
  const { storeUrl, accessToken } = getAdminCredentials();
  
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
 * Get product market information (publishedInContext for FI and DE) and Online Store publication status
 * @param {string} productGid - Product GID format: gid://shopify/Product/{id}
 * @returns {Promise<Object>} { publishedInFI: boolean, publishedInDE: boolean, publishedToOnlineStore: boolean }
 */
export async function getProductMarkets(productGid) {
  // If productGid is not in GID format, convert it
  let productId = productGid;
  if (!productGid.startsWith('gid://shopify/Product/')) {
    productId = `gid://shopify/Product/${productGid}`;
  }

  const query = `
    query getProductMarkets($id: ID!) {
      product(id: $id) {
        id
        title
        publishedInFI: publishedInContext(context: {country: FI})
        publishedInDE: publishedInContext(context: {country: DE})
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
  `;

  try {
    console.log(`[Market Sync] Querying markets and publication status for product: ${productId}`);
    const data = await adminGraphQLRequest(query, { id: productId });
    
    if (!data.product) {
      console.warn(`[Market Sync] Product not found: ${productId}`);
      return { publishedInFI: false, publishedInDE: false, publishedToOnlineStore: false };
    }

    // Check if product is published to Online Store sales channel
    const onlineStorePublication = data.product.resourcePublications?.edges?.find(
      (edge) => edge.node.publication?.name === 'Online Store'
    );
    const publishedToOnlineStore = onlineStorePublication?.node.isPublished || false;

    const markets = {
      publishedInFI: data.product.publishedInFI || false,
      publishedInDE: data.product.publishedInDE || false,
      publishedToOnlineStore,
    };
    
    console.log(`[Market Sync] Product ${productId} (${data.product.title}) - Markets: FI=${markets.publishedInFI}, DE=${markets.publishedInDE}, Online Store=${publishedToOnlineStore}`);
    
    if (!publishedToOnlineStore) {
      console.warn(`[Market Sync] ⚠️  Product ${productId} (${data.product.title}) is NOT published to Online Store - will not be accessible via Storefront API`);
    }
    
    return markets;
  } catch (error) {
    console.error(`[Market Sync] Failed to get product markets for ${productId}:`, error.message || error);
    // Return defaults on error
    return { publishedInFI: false, publishedInDE: false, publishedToOnlineStore: false };
  }
}

/**
 * Build markets array from publishedInContext results
 */
export function buildMarketsArray({ publishedInFI, publishedInDE }) {
  const { buildMarketsArray: buildMarkets } = require('./market-utils');
  return buildMarkets({ publishedInFI, publishedInDE });
}

/**
 * Get Online Store publication ID
 * This is needed to publish products to Online Store sales channel
 * 
 * IMPORTANT: We ONLY use "Online Store" publication, NOT custom catalogs like "Blerinas"
 * Storefront API tokens should be scoped to "Online Store" publication
 */
export async function getOnlineStorePublicationId() {
  const query = `
    query {
      publications(first: 10) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;

  try {
    const data = await adminGraphQLRequest(query);
    const onlineStorePublication = data.publications?.edges?.find(
      (edge) => edge.node.name === 'Online Store'
    );

    if (!onlineStorePublication) {
      throw new Error('Online Store publication not found. Make sure Online Store sales channel is enabled.');
    }

    console.log(`[Publication] Found Online Store publication ID: ${onlineStorePublication.node.id}`);
    return onlineStorePublication.node.id;
  } catch (error) {
    console.error('[Publication] Failed to get Online Store publication ID:', error.message || error);
    throw error;
  }
}

/**
 * Unpublish a product from Online Store sales channel
 * @param {string} productGid - Product GID format: gid://shopify/Product/{id}
 * @param {string} publicationId - Optional publication ID (will query if not provided)
 * @returns {Promise<Object>} Unpublished product data
 */
export async function unpublishProductFromOnlineStore(productGid, publicationId = null) {
  // If productGid is not in GID format, convert it
  let productId = productGid;
  if (!productGid.startsWith('gid://shopify/Product/')) {
    productId = `gid://shopify/Product/${productGid}`;
  }

  // Get publication ID if not provided
  let pubId = publicationId;
  if (!pubId) {
    pubId = await getOnlineStorePublicationId();
  }

  const mutation = `
    mutation publishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
      publishableUnpublish(id: $id, input: $input) {
        publishable {
          ... on Product {
            id
            title
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: productId,
    input: [
      {
        publicationId: pubId,
      },
    ],
  };

  try {
    console.log(`[Publication] Unpublishing product ${productId} from Online Store...`);
    const data = await adminGraphQLRequest(mutation, variables);

    if (data.publishableUnpublish.userErrors && data.publishableUnpublish.userErrors.length > 0) {
      const errors = data.publishableUnpublish.userErrors.map(err => `${err.field}: ${err.message}`).join(', ');
      throw new Error(`Unpublication errors: ${errors}`);
    }

    console.log(`[Publication] ✅ Successfully unpublished product ${productId} (${data.publishableUnpublish.publishable.title}) from Online Store`);
    return data.publishableUnpublish.publishable;
  } catch (error) {
    console.error(`[Publication] Failed to unpublish product ${productId} from Online Store:`, error.message || error);
    throw error;
  }
}

/**
 * Publish a product to Online Store sales channel
 * 
 * IMPORTANT: We ONLY publish to "Online Store" publication, NOT custom catalogs like "Blerinas"
 * This ensures products are accessible via Storefront API when the token is scoped to "Online Store"
 * 
 * @param {string} productGid - Product GID format: gid://shopify/Product/{id}
 * @param {string} publicationId - Optional publication ID (will query if not provided - MUST be "Online Store")
 * @returns {Promise<Object>} Published product data
 */
export async function publishProductToOnlineStore(productGid, publicationId = null) {
  // If productGid is not in GID format, convert it
  let productId = productGid;
  if (!productGid.startsWith('gid://shopify/Product/')) {
    productId = `gid://shopify/Product/${productGid}`;
  }

  // Get publication ID if not provided
  let pubId = publicationId;
  if (!pubId) {
    pubId = await getOnlineStorePublicationId();
  }

  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          ... on Product {
            id
            title
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: productId,
    input: [
      {
        publicationId: pubId,
      },
    ],
  };

  try {
    console.log(`[Publication] Publishing product ${productId} to Online Store...`);
    const data = await adminGraphQLRequest(mutation, variables);

    if (data.publishablePublish.userErrors && data.publishablePublish.userErrors.length > 0) {
      const errors = data.publishablePublish.userErrors.map(err => `${err.field}: ${err.message}`).join(', ');
      throw new Error(`Publication errors: ${errors}`);
    }

    console.log(`[Publication] ✅ Successfully published product ${productId} (${data.publishablePublish.publishable.title}) to Online Store`);
    
    // Check if accessible in Storefront API after publishing (with a short delay for indexing)
    console.log(`[Publication] Checking Storefront API indexing status...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for initial indexing
    
    const accessibilityCheck = await checkProductStorefrontAccessibility(productId);
    if (accessibilityCheck.accessible) {
      console.log(`[Publication] ✅ Product is indexed in Storefront API (${accessibilityCheck.variants.length} variants accessible)`);
    } else {
      console.log(`[Publication] ⏳ Product is published but not yet indexed in Storefront API (this is normal)`);
      console.log(`[Publication] ℹ️  Storefront API indexing typically takes 30-60 seconds after publication`);
      console.log(`[Publication] ℹ️  Variants will become accessible automatically - no action needed`);
    }
    
    return {
      ...data.publishablePublish.publishable,
      storefrontIndexed: accessibilityCheck.accessible,
      variantsAccessible: accessibilityCheck.variants?.length || 0,
    };
  } catch (error) {
    console.error(`[Publication] Failed to publish product ${productId} to Online Store:`, error.message || error);
    throw error;
  }
}

/**
 * Check if a product is accessible via Storefront API
 * @param {string} productGid - Product GID format: gid://shopify/Product/{id}
 * @returns {Promise<Object>} { accessible: boolean, variants: Array, error?: string }
 */
export async function checkProductStorefrontAccessibility(productGid) {
  // If productGid is not in GID format, convert it
  let productId = productGid;
  if (!productGid.startsWith('gid://shopify/Product/')) {
    productId = `gid://shopify/Product/${productGid}`;
  }

  const STOREFRONT_API_URL = process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!STOREFRONT_API_URL || !STOREFRONT_ACCESS_TOKEN) {
    return {
      accessible: false,
      variants: [],
      error: 'Storefront API credentials not configured',
    };
  }

  const query = `
    query checkProductAccessibility($id: ID!) {
      product(id: $id) {
        id
        title
        availableForSale
        variants(first: 10) {
          edges {
            node {
              id
              title
              availableForSale
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
    const url = `https://${STOREFRONT_API_URL}/api/2025-10/graphql.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Storefront-Access-Token': STOREFRONT_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { id: productId },
      }),
    });

    if (!response.ok) {
      return {
        accessible: false,
        variants: [],
        error: `Storefront API error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    if (data.errors) {
      return {
        accessible: false,
        variants: [],
        error: `Storefront API GraphQL errors: ${JSON.stringify(data.errors)}`,
      };
    }

    if (!data.data?.product) {
      return {
        accessible: false,
        variants: [],
        error: 'Product not found in Storefront API (not indexed yet)',
      };
    }

    const variants = (data.data.product.variants?.edges || []).map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      availableForSale: edge.node.availableForSale,
      price: edge.node.priceV2,
    }));

    return {
      accessible: true,
      productTitle: data.data.product.title,
      availableForSale: data.data.product.availableForSale,
      variants,
    };
  } catch (error) {
    return {
      accessible: false,
      variants: [],
      error: `Failed to check Storefront API: ${error.message || error}`,
    };
  }
}

/**
 * Force re-index product in Storefront API by unpublishing and re-publishing
 * This fixes Storefront API visibility issues when products aren't recognized
 * @param {string} productGid - Product GID format: gid://shopify/Product/{id}
 * @param {string} publicationId - Optional publication ID (will query if not provided)
 * @returns {Promise<Object>} Re-published product data with accessibility status
 */
export async function forceReindexProductInStorefront(productGid, publicationId = null) {
  // If productGid is not in GID format, convert it
  let productId = productGid;
  if (!productGid.startsWith('gid://shopify/Product/')) {
    productId = `gid://shopify/Product/${productGid}`;
  }

  // Get publication ID if not provided
  let pubId = publicationId;
  if (!pubId) {
    pubId = await getOnlineStorePublicationId();
  }

  try {
    // Check accessibility BEFORE unpublishing
    console.log(`[Re-index] Checking Storefront API accessibility before fix...`);
    const beforeCheck = await checkProductStorefrontAccessibility(productId);
    const wasAccessible = beforeCheck.accessible;
    
    if (wasAccessible) {
      console.log(`[Re-index] ℹ️  Product is already accessible in Storefront API (${beforeCheck.variants.length} variants)`);
    } else {
      console.log(`[Re-index] ⚠️  Product is NOT accessible in Storefront API: ${beforeCheck.error || 'Not indexed'}`);
    }

    // Step 1: Unpublish
    console.log(`[Re-index] Step 1: Unpublishing ${productId} from Online Store...`);
    await unpublishProductFromOnlineStore(productId, pubId);
    
    // Step 2: Wait 2 seconds for propagation
    console.log(`[Re-index] Waiting 2 seconds for propagation...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Re-publish
    console.log(`[Re-index] Step 2: Re-publishing ${productId} to Online Store...`);
    const result = await publishProductToOnlineStore(productId, pubId);
    
    // Step 4: Wait a bit and check if accessible now
    console.log(`[Re-index] Waiting 3 seconds for Storefront API indexing...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`[Re-index] Checking Storefront API accessibility after fix...`);
    const afterCheck = await checkProductStorefrontAccessibility(productId);
    
    if (afterCheck.accessible) {
      console.log(`[Re-index] ✅ Product is now accessible in Storefront API (${afterCheck.variants.length} variants indexed)`);
    } else {
      console.log(`[Re-index] ⚠️  Product is still NOT accessible in Storefront API: ${afterCheck.error || 'May need more time to index'}`);
      console.log(`[Re-index] ℹ️  It may take 30-60 seconds for Storefront API to fully index. Please test again in a minute.`);
    }
    
    return {
      ...result,
      wasAccessible,
      isNowAccessible: afterCheck.accessible,
      variantsIndexed: afterCheck.variants?.length || 0,
      indexingStatus: afterCheck.accessible ? 'indexed' : 'pending',
    };
  } catch (error) {
    console.error(`[Re-index] Failed to re-index product ${productId}:`, error.message || error);
    throw error;
  }
}

